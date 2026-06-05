# Main_APP/daemon_db.py

import os
import time
import logging
import psycopg2
from sshtunnel import SSHTunnelForwarder
from sqlalchemy import create_engine, text
from decimal import Decimal

SSH_HOST = "ec2-3-67-202-224.eu-central-1.compute.amazonaws.com"
SSH_USER = "admin"
SSH_PRIVATE_KEY = os.getenv("SSH_PRIVATE_KEY")

DB_HOST = "zeronest-productiondb-replica.czgyusukqv81.eu-central-1.rds.amazonaws.com"
DB_PORT = 5432
DB_NAME = "zeronestproduction"
DB_USER = "zeronest"
DB_PASSWORD = os.getenv("ZERONEST_DB_PASSWORD")

# Global variables to hold the persistent connection for the daemon
_tunnel = None
_conn = None
_tunnel_ioe = None
_conn_ioe = None


def get_installation_config_from_algo_db(conn_mydb, installation_id: int) -> dict:
    """
    Get installation configuration for one installation_id from algo/benchmark DB.

    It takes the newest row from installation_config and returns it as a Python dict.
    Decimal database values are converted to float.
    """
    # SELECT * means take all columns from installation_config.
    # WHERE installation_id = :installation_id keeps only rows for this installation.
    # ORDER BY created_time DESC puts newest rows first.
    # LIMIT 1 keeps only the first/newest row.
    query = text("""
                 SELECT *
                 FROM installation_config
                 WHERE installation_id = :installation_id
                 ORDER BY created_time DESC LIMIT 1;
                 """)

    # run this SQL query and pass installation_id as a named parameter
    # SQLAlchemy safely puts this value into :installation_id
    result = conn_mydb.execute(query, {"installation_id": installation_id})

    # mappings() tells SQLAlchemy: return rows like dictionaries, not tuples
    # fetchone() takes only one row from the result
    # because the query orders newest-first and limits to 1, this should be the newest config row
    # record is still a SQLAlchemy RowMapping, not a normal Python dict yet
    record = result.mappings().fetchone()

    # if fetchone() returned None, this installation has no config row in the database
    if not record:
        raise ValueError(
            f"No configuration found in algo_db for Installation ID {installation_id}"
        )

    # convert the SQLAlchemy RowMapping to a normal Python dict
    config_dict = dict(record)

    # go through every key and value in the config dict
    for key, value in config_dict.items():
        # Decimal is a database numeric type
        if isinstance(value, Decimal):
            # replace Decimal with float so the rest of the app gets normal Python numbers
            config_dict[key] = float(value)

    # return the newest installation config as a Python dict
    return config_dict


def get_ioe_connection(max_retries=3, retry_delay_sec=60):
    """
    Returns a persistent psycopg2 connection via an SSH tunnel for headless execution.
    Implements a robust retry mechanism that tears down and rebuilds stale tunnels.
    """
    global _tunnel_ioe, _conn_ioe

    # LOOP STORY:
    # attempt counts how many connection tries already failed.
    # attempt starts at 0, so max_retries=3 gives 4 total tries: 0, 1, 2, 3.
    # Before every pass, while checks whether retry budget remains.
    # Success returns immediately from inside try, so the loop stops early on a good connection.
    # Failure increments attempt, tears down tainted state, then either sleeps/retries or raises.
    attempt = 0
    while attempt <= max_retries:
        try:
            # 1. Start or restart the SSH tunnel if it's dead
            if _tunnel_ioe is None or not _tunnel_ioe.is_active:
                logging.info(
                    f"Starting SSH Tunnel for Daemon (Attempt {attempt + 1}/{max_retries + 1})..."
                )
                _tunnel_ioe = SSHTunnelForwarder(
                    (SSH_HOST, 22),
                    ssh_username=SSH_USER,
                    ssh_pkey=SSH_PRIVATE_KEY,
                    remote_bind_address=(os.environ.get("POSTGRES_IOE_DB"), 5432),
                    local_bind_address=("127.0.0.2", 0),  # Random open port
                )
                _tunnel_ioe.start()

            # 2. Check if DB connection is alive, or create a new one
            if _conn_ioe is None or _conn_ioe.closed != 0:
                _conn_ioe = psycopg2.connect(
                    host="127.0.0.2",
                    port=_tunnel_ioe.local_bind_port,
                    dbname=os.environ.get("IOE_DB_POSTGRES_DB"),
                    user=os.environ.get("IOE_DB_POSTGRES_USER"),
                    password=os.environ.get("IOE_DB_POSTGRES_PASSWORD"),
                    connect_timeout=10,
                )

            # 3. Quick ping to guarantee the connection isn't a "zombie"
            with _conn_ioe.cursor() as cursor:
                cursor.execute("SELECT 1;")

            # Success exit: returning here leaves the function immediately.
            # Python does not go back to the while condition after a working connection is found.
            return _tunnel_ioe, _conn_ioe

        except Exception as e:
            # Progress step for the retry loop.
            # Without increasing attempt, a failing connection could retry forever.
            attempt += 1
            logging.error(f"Database connection error: {e}")

            # --- THE TEARDOWN ---
            # If the connection failed, the state is tainted. Clean it up entirely.
            logging.warning("Tearing down stale connections before retry...")
            if _conn_ioe is not None:
                try:
                    _conn_ioe.close()
                except Exception:
                    pass
                _conn_ioe = None

            if _tunnel_ioe is not None:
                try:
                    _tunnel_ioe.stop()
                except Exception:
                    pass
                _tunnel_ioe = None

            # --- THE BACKOFF ---
            # If retry budget remains, pause before the next while pass.
            # After sleep, Python jumps back to "while attempt <= max_retries" and checks again.
            if attempt <= max_retries:
                logging.info(f"Retrying connection in {retry_delay_sec} seconds...")
                time.sleep(retry_delay_sec)
            else:
                # Failed-loop exit: retry budget is exhausted, so re-raise the current error.
                logging.critical(
                    "CRITICAL FAILURE: Max database connection retries exceeded. Crashing gracefully."
                )
                raise  # Re-raise the exception to let the orchestrator handle/crash


def get_benchmark_connection():
    """
    Creates and returns a SQLAlchemy connection to the benchmark database.
    Used for passing 'conn' to fetch_data_from_benchmark.
    """
    host = os.environ.get("POSTGRES_BENCHMARK_DB")
    if not host:
        return None

    pg_user = os.environ.get("BENCH_DB_POSTGRES_USER", "postgres")
    pg_pass = os.environ.get("BENCH_DB_POSTGRES_PASSWORD", "postgres")
    pg_db = os.environ.get("BENCH_DB_POSTGRES_DB", "postgres")

    pg_uri = f"postgresql://{pg_user}:{pg_pass}@{host}:5432/{pg_db}"
    engine = create_engine(pg_uri)
    return engine.connect()


def close_connection(conn):
    if conn:
        conn.close()


def return_headless_connection():
    global _tunnel, _conn

    if _tunnel is not None and _conn is not None:
        return _tunnel, _conn
    else:
        _tunnel, _conn = get_headless_connection()
        return _tunnel, _conn


def get_headless_connection(max_retries=3, retry_delay_sec=60):
    """
    Returns a persistent psycopg2 connection via an SSH tunnel for headless execution.
    Implements a robust retry mechanism that tears down and rebuilds stale tunnels.
    """
    global _tunnel, _conn

    # LOOP STORY:
    # attempt counts how many connection tries already failed.
    # attempt starts at 0, so max_retries=3 gives 4 total tries: 0, 1, 2, 3.
    # Before every pass, while checks whether retry budget remains.
    # Success returns immediately from inside try, so the loop stops early on a good connection.
    # Failure increments attempt, tears down tainted state, then either sleeps/retries or raises.
    attempt = 0
    while attempt <= max_retries:
        try:
            # 1. Start or restart the SSH tunnel if it's dead
            if _tunnel is None or not _tunnel.is_active:
                logging.info(
                    f"Starting SSH Tunnel for Daemon (Attempt {attempt + 1}/{max_retries + 1})..."
                )
                _tunnel = SSHTunnelForwarder(
                    (SSH_HOST, 22),
                    ssh_username=SSH_USER,
                    ssh_pkey=SSH_PRIVATE_KEY,
                    remote_bind_address=(DB_HOST, DB_PORT),
                    local_bind_address=("127.0.0.1", 0),  # Random open port
                )
                _tunnel.start()

            # 2. Check if DB connection is alive, or create a new one
            if _conn is None or _conn.closed != 0:
                _conn = psycopg2.connect(
                    host="127.0.0.1",
                    port=_tunnel.local_bind_port,
                    dbname=DB_NAME,
                    user=DB_USER,
                    password=DB_PASSWORD,
                    connect_timeout=10,
                )
            _conn.autocommit = True
            # 3. Quick ping to guarantee the connection isn't a "zombie"
            with _conn.cursor() as cursor:
                cursor.execute("SELECT 1;")

            # Success exit: returning here leaves the function immediately.
            # Python does not go back to the while condition after a working connection is found.
            return _tunnel, _conn

        except Exception as e:
            # Progress step for the retry loop.
            # Without increasing attempt, a failing connection could retry forever.
            attempt += 1
            logging.error(f"Database connection error: {e}")

            # --- THE TEARDOWN ---
            # If the connection failed, the state is tainted. Clean it up entirely.
            logging.warning("Tearing down stale connections before retry...")
            if _conn is not None:
                try:
                    _conn.close()
                except Exception:
                    pass
                _conn = None

            if _tunnel is not None:
                try:
                    _tunnel.stop()
                except Exception:
                    pass
                _tunnel = None

            # --- THE BACKOFF ---
            # If retry budget remains, pause before the next while pass.
            # After sleep, Python jumps back to "while attempt <= max_retries" and checks again.
            if attempt <= max_retries:
                logging.info(f"Retrying connection in {retry_delay_sec} seconds...")
                time.sleep(retry_delay_sec)
            else:
                # Failed-loop exit: retry budget is exhausted, so re-raise the current error.
                logging.critical(
                    "CRITICAL FAILURE: Max database connection retries exceeded. Crashing gracefully."
                )
                raise  # Re-raise the exception to let the orchestrator handle/crash


def get_installation_config(conn, installation_id: int) -> dict:
    """
    Queries the database to fetch the configuration for a specific installation.
    """
    query = """
            WITH AggregatedStorage AS (SELECT is_storage.installation_id, \
                                              SUM(ds.capacity) AS battery_capacity \
                                       FROM public.installations_installationstorage is_storage \
                                                JOIN public.devices_storage ds \
                                                     ON is_storage.storage_id = ds.device_ptr_id \
                                       GROUP BY is_storage.installation_id)
            SELECT i.id AS installation_id, \
                   addr.street, \
                   addr.city, \
                   addr.zip_code, \
                   addr.latitude, \
                   addr.longitude, \
                   i.commodity_buy_tariff_id, \
                   i.commodity_sell_tariff_id, \
                   i.distribution_tariff_id, \
                   i.max_soc_charge_decision, \
                   i.min_production_prediction_correction_modifier, \
                   ast.battery_capacity, \
                   m.imei, \
                   inv.max_soc, \
                   inv.min_soc, \
                   inv.power, \
                   inv.max_charge_delta, \
                   inv.management_module
            FROM public.installations_installation i
                     JOIN public.installations_installationaddress addr
                          ON i.id = addr.installation_id
                     LEFT JOIN AggregatedStorage ast
                               ON i.id = ast.installation_id
                     JOIN public.installations_installationmodem m
                          ON i.id = m.installation_id
                     LEFT JOIN public.installations_installationinverter inv_link
                               ON i.id = inv_link.installation_id
                     LEFT JOIN public.devices_inverter inv
                               ON inv_link.inverter_id = inv.device_ptr_id
            WHERE i.id = %s LIMIT 1; \
            """

    # Using a context manager ensures the cursor is closed even if an error occurs
    with conn.cursor() as cursor:
        cursor.execute(query, (installation_id,))
        record = cursor.fetchone()

        if not record:
            raise ValueError(
                f"No configuration found in database for Installation ID {installation_id}"
            )

        columns = [desc[0] for desc in cursor.description]
        config_dict = dict(zip(columns, record))
        try:
            config_dict["max_power_kw"] = config_dict["power"]
            del config_dict["power"]
        except KeyError:
            pass
    return config_dict
