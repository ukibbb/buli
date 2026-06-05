# logging lets this file write useful messages like "cache empty" or "database fetch failed".
# Those messages help us understand what the daemon did while running.
# import logging loads Python's built-in logging library; it does not create a logger yet.
# Later calls like logging.info(...) and logging.error(...) send messages to the configured daemon logs.
import logging

# fsspec gives one filesystem interface for different storage locations.
# The same code can check/read paths that are local files or S3 paths.
# fsspec.core.url_to_fs(path) looks at a path like "s3://..." or "cache/file.parquet"
# and returns an fs object with methods like exists(...) and open(...).
import fsspec

# pandas is used for DataFrames, parquet files, timestamps, numeric conversion and merging rows.
# The alias "pd" is the normal short name used in pandas code.
# Calls like pd.concat(...), pd.read_parquet(...), and pd.to_datetime(...) all come from this import.
import pandas as pd

# Path is a safer object for building local filesystem paths.
# Path("daemon_cache") / "file.parquet" joins paths with the right slash for the operating system.
from pathlib import Path

# datetime/timedelta/timezone are used to work with UTC time windows.
# datetime represents one exact date/time, timedelta represents a duration, and timezone.utc marks UTC time.
from datetime import datetime, timedelta, timezone

# time is used only for a small sleep between database chunks.
# This gives the database a tiny pause instead of hammering it with queries.
# time.sleep(0.5) pauses this Python process for half a second.
import time

# return_headless_connection gives us/reuses the database connection used by the daemon.
# It returns two things: tunnel and connection; this file usually ignores tunnel and uses conn.
from Main_APP.daemon_db import return_headless_connection

# CACHE_BASE tells us where cache files live: local cache folder or S3 cache path.
# atomic_save_parquet saves parquet safely, especially for local files where it writes temp file first.
# This file passes a DataFrame and target path into atomic_save_parquet; the helper decides local-vs-S3 behavior.
from Main_APP.file_paths import CACHE_BASE, atomic_save_parquet

# run_headless_sanitation cleans raw time-series rows before they are stored in sanitized cache.
# It receives a DataFrame, an installation id for logging/context, and flags like detailed_logging=False.
from data_processing.utilities.data_integrity import run_headless_sanitation

# This dictionary maps database column names to readable column names used later in the project.
# Left side = short/raw column name from data_modemdata table.
# Right side = readable column name that downstream code expects.
COLUMN_MAPPING = {
    # timestamp stays timestamp because it becomes the DataFrame index later.
    "timestamp": "timestamp",
    # energy imported from grid.
    "ei": "Energy from grid",
    # energy exported back to grid.
    "eo": "Energy exported to grid",
    # energy produced by installation.
    "ep": "Energy produced",
    # power coming in.
    "pi": "Power in",
    # power going out.
    "po": "Power out",
    # current produced power.
    "pp": "Power Produced",
    # calculated/recorded consumption value.
    "consumption": "consumption",
    # battery state of charge.
    "bc": "State of charge",
    # power going into battery.
    "pbi": "Power battery in",
    # power coming out of battery.
    "pbo": "Power battery out",
    # energy going into battery.
    "ebi": "Energy battery in",
    # energy coming out of battery.
    "ebo": "Energy battery out",
}

# create Path object for local raw cache folder called daemon_cache
# Path("daemon_cache") does not create the folder yet; it only builds a path object in memory.
# This folder is for the older/local raw cache helper update_timeseries_cache().
CACHE_DIR = Path("daemon_cache")
# create this folder if it does not exist yet
# mkdir(...) is a method call on the Path object above.
# parents=True means create parent folders too if needed
# exist_ok=True means do not crash if folder already exists
# after this line executes, local code can safely write files inside daemon_cache/
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def get_cache_path(installation_id: int) -> Path:
    # build local parquet file path for this installation raw time-series cache
    # installation_id is inserted into the filename so each installation has its own file
    # example: installation_id=226 becomes daemon_cache/timeseries_226.parquet
    # the / operator on a Path joins CACHE_DIR with the filename and returns a new Path object
    return CACHE_DIR / f"timeseries_{installation_id}.parquet"


def load_local_cache(installation_id: int) -> pd.DataFrame:
    """
    Load local raw time-series cache for one installation.

    If file exists, read parquet into pandas DataFrame.
    If file does not exist or reading fails, return empty DataFrame with UTC timestamp index.
    """
    # create local cache file path for this installation
    # get_cache_path returns a Path object like daemon_cache/timeseries_226.parquet
    path = get_cache_path(installation_id)

    # check if this parquet cache file exists on local disk
    # path.exists() asks the operating system whether this file/path is present right now
    if path.exists():
        try:
            # read parquet file into pandas DataFrame
            # pd.read_parquet(path) opens the parquet file, decodes its columnar data, and returns a new DataFrame
            # the file on disk is not changed by reading it
            df = pd.read_parquet(path)

            # if index timestamps do not have timezone information
            # df.index is the row index; .tz is None when pandas sees timestamps as timezone-naive
            if df.index.tz is None:
                # tell pandas these existing timestamps should be treated as UTC
                # tz_localize("UTC") attaches UTC timezone metadata; it does not shift the clock values
                # assigning back to df.index updates the DataFrame index in RAM
                df.index = df.index.tz_localize("UTC")

            # return loaded cache DataFrame
            # caller receives this DataFrame and can compare its timestamp index to target_start/target_end
            return df
        except Exception as e:
            # if reading cache fails, write error to logs and continue with empty cache
            logging.error(
                f"Failed to load cache for ID {installation_id}: {e}. Starting fresh."
            )

    # create empty timestamp index that already knows timezone is UTC
    # pd.DatetimeIndex(...) builds an index object specifically for datetime row labels
    # [] means it has zero timestamps/rows
    # tz=timezone.utc means future comparisons use UTC-aware timestamps
    # name="timestamp" gives the index the same semantic name as the database timestamp column
    # this keeps later timestamp comparisons safer even when cache is empty
    empty_index = pd.DatetimeIndex([], tz=timezone.utc, name="timestamp")

    # return empty DataFrame with this UTC timestamp index
    # pd.DataFrame(index=empty_index) creates a DataFrame with no columns and no rows, but with correct time index type
    return pd.DataFrame(index=empty_index)


def fetch_timeseries_gap(
    imei: str, df_cache: pd.DataFrame, target_start: datetime, target_end: datetime
) -> pd.DataFrame:
    """
    Look at the cached dataframe and decide what timestamp ranges are missing.

    This only checks the two edges of the cache:
    - data missing before the oldest cached timestamp
    - data missing after the newest cached timestamp

    It does not search for holes inside the cached time span.
    """
    # create empty list of intervals we need to fetch from database
    # each item will look like: (interval_start, interval_end)
    # append(...) later mutates this same list by adding missing time ranges
    intervals_to_fetch = []

    # if cache dataframe has no rows, we have no cached history at all
    # df_cache.empty is a pandas property that is True when there are zero rows or zero columns
    if df_cache.empty:
        # write info log so daemon logs explain why full window is being fetched
        logging.info("Cache empty. Fetching full window.")

        # add one interval for the whole requested window: target_start to target_end
        # tuple order matters: first value is SQL lower time boundary, second value is SQL upper time boundary
        intervals_to_fetch.append((target_start, target_end))
    # if cache already has data, check only what is missing before/after it
    else:
        # Example rolling request:
        # real UTC time:  2026-06-03 22:21:03
        # now_utc:        2026-06-03 22:00:00
        # target_start:   2026-04-04 22:00:00
        # target_end:     2026-06-03 23:00:00

        # get oldest timestamp currently stored in cache
        # df_cache.index is the timestamp index; .min() returns the earliest timestamp label
        cache_min = df_cache.index.min()
        # get newest timestamp currently stored in cache
        # .max() returns the latest timestamp label, so together cache_min/cache_max describe cache coverage edges
        cache_max = df_cache.index.max()

        # if target_start + 14 minutes is still earlier than cache_min,
        # cache starts too late and old/historical data is missing before cache_min
        # pd.Timedelta(minutes=14) creates a pandas duration object equal to 14 minutes
        # this tolerance avoids fetching tiny edge gaps smaller than one expected 15-minute interval
        if target_start + pd.Timedelta(minutes=14) < cache_min:
            # take earlier timestamp from target_end and cache_min
            # min(a, b) returns whichever datetime is earlier
            # normally this is cache_min, but if target_end is before cache_min, stop at target_end
            past_end = min(target_end, cache_min)

            # write log showing exact historical range that will be fetched
            logging.info(
                f"Historical gap detected! Need to backfill from {target_start} to {past_end}."
            )

            # add interval for missing historical edge: target_start to past_end
            # this appends a tuple that the chunking loop will later split into 5-day SQL chunks
            intervals_to_fetch.append((target_start, past_end))

        # if target_end is later/newer than cache_max,
        # requested window is missing recent/future data after newest cached timestamp
        if target_end > cache_max:
            # take newer/later timestamp from target_start and cache_max
            # max(a, b) returns whichever datetime is later
            # normally cache_max is newer, but if cache is very old, target_start can be newer
            future_start = max(target_start, cache_max)

            # write log showing exact recent range that will be fetched
            logging.info(
                f"Recent gap detected! Need to forward-fill from {future_start} to {target_end}."
            )

            # add interval for missing recent edge: future_start to target_end
            # this tells the SQL loop to fetch rows newer than the cached edge up to requested target_end
            intervals_to_fetch.append((future_start, target_end))

    # if no intervals were added, cache already covers requested edge range
    # in Python, an empty list behaves like False, so "not intervals_to_fetch" means list has no fetch jobs
    if not intervals_to_fetch:
        # write log so it is clear no database call is needed
        logging.info("Cache is fully up to date. No database fetch required.")

        # return empty DataFrame because there are no new rows to merge
        return pd.DataFrame()

    # --- CHUNKING LOGIC ---
    # fetch database rows in smaller chunks, not one huge query
    # 5 days is safer for database load and query timeout risk
    # CHUNK_DAYS is used below inside timedelta(days=CHUNK_DAYS)
    CHUNK_DAYS = 5  # Safely ask for 5 days at a time

    # all_records will collect raw database rows from every chunk
    # cursor.fetchall() returns rows, then we extend this list with them
    # this stays a plain Python list until we convert it into a pandas DataFrame later
    all_records = []

    try:
        # get/reuse daemon database connection
        # return_headless_connection returns tunnel and connection; we only need conn here
        # the underscore variable means "we intentionally ignore this returned tunnel value"
        # conn is the database connection object used to create cursors and run SQL queries
        _, conn = return_headless_connection()

        # take keys from COLUMN_MAPPING and convert them into list of database column names
        # COLUMN_MAPPING.keys() gives an ordered view of keys like "timestamp", "ei", "eo"
        # list(...) turns that view into a normal list we can reuse for SQL columns and DataFrame columns
        db_columns = list(COLUMN_MAPPING.keys())

        # join this list into one comma-separated string for SELECT part of SQL
        # ", ".join(db_columns) takes each column name string and puts ", " between them
        # example: "timestamp, ei, eo, ep, ..."
        columns_str = ", ".join(db_columns)

        # create SQL query text
        # columns_str is inserted into SELECT because column names cannot be passed as %s parameters
        # imei/current_start/current_end are passed safely later through cursor.execute parameters
        # the %s symbols are placeholders; the database driver fills them with values from cursor.execute(...)
        # SQL range is: timestamp > interval_start and timestamp <= interval_end
        # so start boundary is excluded and end boundary is included
        # this avoids fetching the same boundary timestamp twice when chunks touch each other
        # ORDER BY timestamp ASC asks the database to return oldest rows first
        query = f"""
            SELECT {columns_str}
            FROM data_modemdata
            WHERE imei = %s
              AND timestamp > %s
              AND timestamp <= %s
            ORDER BY timestamp ASC;
        """

        # count how many database chunks we query, only for logging/debugging
        total_chunks = 0

        # loop through all missing intervals we identified: historical and/or recent
        for interval_start, interval_end in intervals_to_fetch:
            # current_start tells where this 5-day database chunk starts
            # assigning interval_start here resets the pointer for each missing interval
            current_start = interval_start

            # LOOP STORY:
            # current_start is the moving pointer through this missing interval.
            # Before every pass, while checks whether current_start is still before interval_end.
            # Each pass chooses current_end, then fetches one database chunk: (current_start, current_end].
            # current_start = current_end is the progress step that moves the pointer forward.
            # When current_start reaches interval_end, the condition becomes False and this while loop ends.
            # The chunk is (current_start, current_end], not [current_start, current_end], because SQL uses
            # timestamp > current_start and timestamp <= current_end.
            while current_start < interval_end:
                # current_end is 5 days after current_start, but never later than interval_end
                # timedelta(days=CHUNK_DAYS) creates a duration of 5 days
                # min(..., interval_end) clips the chunk so the final chunk stops exactly at interval_end
                current_end = min(
                    current_start + timedelta(days=CHUNK_DAYS), interval_end
                )

                # increase chunk counter because we are about to run one database query
                total_chunks += 1

                # log which date range this chunk is fetching
                logging.info(
                    f"Fetching chunk {total_chunks}: {current_start.strftime('%Y-%m-%d')} to {current_end.strftime('%Y-%m-%d')}..."
                )

                # open database cursor
                # conn.cursor() creates a cursor object from the active database connection
                # cursor is the object used to send SQL query to database and read results
                # with ... as cursor is a context manager; it closes/cleans up the cursor when the block ends
                with conn.cursor() as cursor:
                    # execute SQL query for this imei and this chunk time range
                    # first argument is the SQL query string with %s placeholders
                    # second argument is a tuple of values that fill the placeholders in order:
                    # 1) imei filters rows to one modem/installation
                    # 2) current_start fills timestamp > %s
                    # 3) current_end fills timestamp <= %s
                    # passing values separately lets the database driver quote/escape them safely
                    cursor.execute(query, (imei, current_start, current_end))

                    # fetchall returns all rows found by this chunk query
                    # each row is usually a tuple with values in same order as SELECT/db_columns
                    # example row shape: (timestamp_value, ei_value, eo_value, ...)
                    chunk_records = cursor.fetchall()

                    # add rows from this chunk into one big list of all fetched records
                    # list.extend(other_list) appends every row from chunk_records into all_records
                    # this mutates all_records in place; it does not create a new list variable
                    all_records.extend(chunk_records)

                # Progress step: move start pointer forward so next loop fetches the next chunk.
                # This is what eventually makes current_start < interval_end become false.
                # Without this assignment, the while loop could keep asking for the same chunk forever.
                current_start = current_end

                # give the database a tiny breather between chunks
                time.sleep(0.5)  # Give the database a tiny breather between chunks

        # if database returned zero rows for all chunks
        if not all_records:
            # write warning because query ran, but there was no matching data
            logging.warning(
                f"No new data found in database for IMEI {imei} in requested gaps."
            )

            # return empty DataFrame because there is nothing new to merge
            return pd.DataFrame()

        # convert raw database rows into pandas DataFrame in RAM
        # all_records contains tuples returned by cursor.fetchall()
        # db_columns gives pandas column names in same order as SELECT query
        # pd.DataFrame(data, columns=...) builds a table where each tuple becomes one row
        # columns=db_columns tells pandas what to call each column instead of using 0, 1, 2, ...
        df_new = pd.DataFrame(all_records, columns=db_columns)

        # rename short database column names into readable project names
        # columns=COLUMN_MAPPING passes a dict: old_name -> new_name
        # inplace=True means pandas mutates df_new directly instead of returning a renamed copy
        # example: "ei" becomes "Energy from grid"
        df_new.rename(columns=COLUMN_MAPPING, inplace=True)

        # build list of all columns except timestamp
        # df_new.columns is the column index; the list comprehension loops over every column name
        # if c != "timestamp" filters out the time column because time should become the index, not numeric sensor data
        # these should be numeric sensor/energy/power columns
        numeric_cols = [c for c in df_new.columns if c != "timestamp"]

        # convert numeric columns to actual numbers
        # df_new[numeric_cols] selects only those sensor columns as a smaller DataFrame
        # .apply(pd.to_numeric, errors="coerce") runs pd.to_numeric on each selected column
        # errors="coerce" means bad/unparseable values become NaN instead of crashing
        # assigning back replaces the selected columns in df_new with converted numeric versions
        df_new[numeric_cols] = df_new[numeric_cols].apply(
            pd.to_numeric, errors="coerce"
        )

        # convert timestamp column to pandas datetime objects with UTC timezone
        # pd.to_datetime(...) parses strings/database timestamp objects into pandas Timestamp values
        # utc=True makes the result timezone-aware in UTC, which keeps comparisons safe later
        df_new["timestamp"] = pd.to_datetime(df_new["timestamp"], utc=True)

        # remove rows where timestamp could not be parsed and became missing/NaT
        # subset=["timestamp"] means only check the timestamp column for missing values
        # inplace=True mutates df_new by dropping those bad rows directly
        df_new.dropna(subset=["timestamp"], inplace=True)

        # make timestamp the DataFrame index
        # set_index("timestamp") moves that column into df_new.index
        # inplace=True mutates df_new; after this, timestamp is no longer a normal data column
        # later cache logic expects time to live in df.index
        df_new.set_index("timestamp", inplace=True)

        # log final count of new rows after conversion/cleanup
        logging.info(
            f"Successfully fetched {len(df_new)} total new records across {total_chunks} chunks."
        )

        # return new raw rows from database
        return df_new

    except Exception as e:
        # if anything in database fetch/conversion fails, log the error
        logging.error(f"Database fetch failed for IMEI {imei}: {e}")

        # return empty DataFrame so caller can continue without new rows
        return pd.DataFrame()


def update_and_sanitize_timeseries(
    installation_id: int, imei: str, target_start: datetime, target_end: datetime
) -> pd.DataFrame:
    """
    Update sanitized time-series cache for one installation.

    Step by step:
    1. Load existing sanitized cache if it exists.
    2. Fetch only missing edge data from database.
    3. Sanitize the new raw rows, using cache boundary rows as context.
    4. Merge old cache + sanitized new chunks.
    5. Trim to target_start and save the rolling cache.
    """
    # create logger for this installation
    # logging.getLogger(name) returns a logger object with that name; it does not write anything yet
    # logger name looks like: Daemon_226
    logger = logging.getLogger(f"Daemon_{installation_id}")

    # create path where sanitized cache parquet should live
    # CACHE_BASE can point to local cache folder or S3 cache path
    # imei is used in filename because modem data is tied to modem identifier
    # example local path: cache/sanitized_timeseries_123456.parquet
    # example S3 path can start with s3://... depending on CACHE_BASE
    cache_path = f"{CACHE_BASE}/sanitized_timeseries_{imei}.parquet"

    # ask fsspec to create filesystem object for this path, local or S3
    # fsspec.core.url_to_fs(cache_path) returns two things: fs object and normalized path detail
    # fs will know how to check/open this specific kind of path
    # underscore means we ignore the second returned value because later code keeps using cache_path directly
    fs, _ = fsspec.core.url_to_fs(cache_path)

    # use created filesystem to check if sanitized cache file already exists
    # fs.exists(cache_path) works for local paths and S3 paths because fs came from fsspec
    if fs.exists(cache_path):
        # if cache exists, load parquet file into dataframe
        # parquet is a column-based file format that pandas can read efficiently
        # pd.read_parquet(cache_path) returns a new DataFrame in memory; it does not edit the file
        df_cache = pd.read_parquet(cache_path)

        # if dataframe index timestamps do not have timezone set
        # timezone-aware indexes are important because target_start/target_end are UTC-aware datetimes
        if df_cache.index.tz is None:
            # tell pandas these timestamps are UTC
            # tz_localize("UTC") labels naive timestamps as UTC without changing their hour/minute values
            df_cache.index = df_cache.index.tz_localize("UTC")
    # if sanitized cache file does not exist yet
    else:
        # create empty dataframe, so first run will fetch full requested window
        # empty DataFrame is used as a signal to fetch_timeseries_gap: there is no cached history yet
        df_cache = pd.DataFrame()

    # fetch only missing data at cache edges: before oldest row or after newest row
    # imei tells the database which modem rows to fetch
    # df_cache tells the helper what timestamps are already available
    # target_start and target_end define the requested rolling time window
    # this does not search for holes inside existing cache
    # returned df_new_raw contains newly fetched raw rows only, or an empty DataFrame if nothing is missing
    df_new_raw = fetch_timeseries_gap(imei, df_cache, target_start, target_end)

    # if database did not return any new raw rows
    # df_new_raw.empty is True when there are no rows/columns to sanitize or merge
    if df_new_raw.empty:
        # write log so daemon output explains why sanitation is skipped
        logger.info("No new time-series data to sanitize. Returning cached data.")

        # if we already have cache rows
        if not df_cache.empty:
            # keep only cache rows inside current rolling training window
            # df_cache.index >= target_start creates a boolean mask: True for rows at/after target_start
            # df_cache[mask] returns a filtered DataFrame containing only True rows
            df_cache = df_cache[df_cache.index >= target_start]

        # return existing cache, possibly trimmed to target_start
        # no save happens in this early return, so the file is not rewritten when there is no new raw data
        return df_cache

    # new raw rows from database still need sanitation before they go into sanitized cache
    logger.info(f"Sanitizing {len(df_new_raw)} new raw records...")

    # collect cleaned pieces here, then merge them with existing cache later
    # each item appended to this list should be a sanitized DataFrame chunk
    sanitized_chunks = []

    # if sanitized cache already exists, sanitize new edge rows with boundary context
    # boundary context means we temporarily include one old cache row next to new rows
    # this helps sanitation detect jumps/resets at the edge between old cache and newly fetched data
    if not df_cache.empty:
        # A. Historical backfill: rows older than current cache
        # df_cache.index.min() returns the oldest timestamp currently in sanitized cache
        # df_new_raw.index < df_cache.index.min() creates a boolean mask for rows before that timestamp
        # df_new_raw[mask] returns only those older rows as a new DataFrame view/copy-like object
        # these are new rows that belong before the oldest cached timestamp
        new_past = df_new_raw[df_new_raw.index < df_cache.index.min()]

        # if there is any historical/backfill data to clean
        # new_past.empty checks whether the filter above found at least one older row
        if not new_past.empty:
            # borrow the FIRST row of cache
            # df_cache.iloc[[0]] selects rows by integer position, not by timestamp label
            # [0] means "the first row"; double brackets [[0]] keep the result as a DataFrame
            # pd.concat([...]) takes a list of DataFrames and stacks them vertically in list order
            # here the new historical rows come first, then the borrowed first cache row
            # concat returns a new DataFrame; it does not mutate new_past or df_cache directly
            # this gives sanitation context for the jump between backfill data and existing cache
            df_to_sanitize_past = pd.concat([new_past, df_cache.iloc[[0]]])

            # remove duplicate timestamps and sort by timestamp
            # df_to_sanitize_past.index.duplicated(keep="first") returns a boolean mask
            # mask value True means "this timestamp is a duplicate after the first occurrence"
            # keep="first" keeps the first row when same timestamp appears twice
            # ~ flips the boolean mask, so duplicates become False and non-duplicates become True
            # df_to_sanitize_past[mask] keeps only rows where the final mask is True
            # .sort_index() returns rows sorted by timestamp index from oldest to newest
            df_to_sanitize_past = df_to_sanitize_past[
                ~df_to_sanitize_past.index.duplicated(keep="first")
            ].sort_index()

            # run sanitation rules on historical rows plus one borrowed boundary row
            # first argument is the DataFrame to clean
            # installation_id tells sanitation/logging which installation this data belongs to
            # detailed_logging=False means do normal cleaning without extra diagnostic files/logs
            # returned clean_past is the sanitized DataFrame produced by the sanitation helper
            clean_past = run_headless_sanitation(
                df_to_sanitize_past, installation_id, detailed_logging=False
            )

            # store cleaned historical chunk so it can be merged later
            # append(...) mutates sanitized_chunks by adding this DataFrame as a new list item
            sanitized_chunks.append(clean_past)

        # B. Recent forward-fill: rows newer than current cache
        # df_cache.index.max() returns the newest timestamp currently in sanitized cache
        # df_new_raw.index > df_cache.index.max() creates a boolean mask for rows after that timestamp
        # df_new_raw[mask] returns only those newer rows as a new DataFrame view/copy-like object
        # these are new rows that belong after the newest cached timestamp
        new_future = df_new_raw[df_new_raw.index > df_cache.index.max()]

        # if there is any recent/future data to clean
        # new_future.empty checks whether the filter above found at least one newer row
        if not new_future.empty:
            # borrow the LAST row of cache
            # df_cache.iloc[[-1]] selects rows by integer position, not by timestamp value
            # -1 means "the last row"; double brackets [[-1]] keep the result as a DataFrame
            # pd.concat([...]) takes a list of DataFrames and stacks them vertically in list order
            # here the borrowed cache boundary row comes first, then all rows from new_future
            # concat creates a new DataFrame; it does not change df_cache or new_future directly
            # this gives sanitation context for the jump between existing cache and new future data
            df_to_sanitize_future = pd.concat([df_cache.iloc[[-1]], new_future])

            # remove duplicate timestamps and sort by timestamp
            # df_to_sanitize_future.index.duplicated(keep="first") returns True for duplicate timestamps after the first one
            # keep="first" keeps the cache boundary row first if overlap exists
            # ~ negates the duplicate mask, so the bracket filter keeps only non-duplicate rows
            # .sort_index() returns a DataFrame ordered by timestamp from oldest to newest
            df_to_sanitize_future = df_to_sanitize_future[
                ~df_to_sanitize_future.index.duplicated(keep="first")
            ].sort_index()

            # run sanitation rules on one borrowed boundary row plus new future rows
            # first argument is the context DataFrame, including the borrowed last cache row
            # installation_id gives the sanitizer installation-specific context/logging name
            # detailed_logging=False keeps sanitation quieter in daemon/headless mode
            # returned clean_future is a sanitized DataFrame ready to merge into cache
            clean_future = run_headless_sanitation(
                df_to_sanitize_future, installation_id, detailed_logging=False
            )

            # store cleaned future chunk so it can be merged later
            # append(...) changes sanitized_chunks in RAM only
            sanitized_chunks.append(clean_future)
    else:
        # if no cache exists, there are no boundary rows to borrow
        # sanitize the whole raw block at once
        # df_new_raw is passed directly because all fetched rows belong to a brand-new sanitized cache
        # installation_id gives the sanitizer installation-specific context/logging name
        # detailed_logging=False keeps daemon sanitation from producing extra detailed diagnostics
        clean_all = run_headless_sanitation(
            df_new_raw, installation_id, detailed_logging=False
        )

        # store cleaned full block so it can be merged later
        # append(...) adds clean_all as the first/only sanitized chunk in this first-run case
        sanitized_chunks.append(clean_all)

    # put old cache and all cleaned new chunks into one list
    # [df_cache] creates a one-item list containing the existing cache DataFrame
    # + sanitized_chunks creates a new list where old cache is first and cleaned new chunks follow
    # order matters because later duplicated(keep="last") keeps later rows when timestamps overlap
    dfs_to_merge = [df_cache] + sanitized_chunks

    # merge them into one dataframe
    # pandas concat stacks rows from all DataFrames together
    # pd.concat(dfs_to_merge) returns a new DataFrame; it does not mutate df_cache or the chunk DataFrames
    # this combined table may temporarily contain duplicate boundary timestamps
    df_full = pd.concat(dfs_to_merge)

    # remove duplicate timestamps
    # df_full.index.duplicated(keep="last") returns True for duplicate timestamp rows except the last occurrence
    # ~ flips that mask so duplicate old rows are removed and rows to keep are True
    # this also removes overlapping boundary rows that we borrowed for sanitation
    # keep="last" means if old cache and new cleaned row share timestamp, keep the later one in concat order
    # .sort_index() returns the final cache sorted chronologically
    df_full = df_full[~df_full.index.duplicated(keep="last")].sort_index()

    # keep only current rolling training window so cache file does not grow forever
    # df_full.index >= target_start creates True for rows inside the requested window
    # df_full[mask] returns only rows newer than or equal to target_start
    df_full = df_full[df_full.index >= target_start]

    # save updated rolling cache parquet to local/S3 path
    # atomic_save_parquet receives the DataFrame to write and the destination path
    # for local paths the helper writes a temporary file then replaces the target; for S3 it writes directly
    # after this line succeeds, downstream pipeline steps can load the updated sanitized cache
    atomic_save_parquet(df_full, cache_path)

    # return full sanitized rolling cache DataFrame
    return df_full


def update_timeseries_cache(
    installation_id: int, imei: str, target_start: datetime, target_end: datetime
) -> pd.DataFrame:
    """
    Load local raw cache, fetch missing database rows, merge them, trim old rows and save.

    This helper works with the local raw cache path from get_cache_path().
    The sanitized cache flow above uses update_and_sanitize_timeseries().
    """
    # load local raw cache for this installation
    # load_local_cache reads daemon_cache/timeseries_<installation_id>.parquet if it exists
    # if no local cache file exists, this returns empty DataFrame with UTC timestamp index
    df_cache = load_local_cache(installation_id)

    # fetch only missing edge rows from database
    # imei identifies the modem rows in data_modemdata
    # df_cache tells fetch_timeseries_gap which timestamps are already available
    # target_start/target_end define the requested rolling window
    # this can return empty DataFrame if cache is already up to date
    df_new = fetch_timeseries_gap(imei, df_cache, target_start, target_end)

    # if database returned new rows
    if not df_new.empty:
        # merge old raw cache and new raw rows into one DataFrame
        # pd.concat([...]) stacks DataFrames vertically in the list order: old cache first, new rows second
        # concat returns a new DataFrame; it does not mutate df_cache or df_new directly
        df_raw = pd.concat([df_cache, df_new])
    # if there are no new rows
    else:
        # copy cache so df_raw is a separate DataFrame object
        # df_cache.copy() creates a copy in RAM so later filtering/reassignment works on df_raw
        df_raw = df_cache.copy()

    # if there is still no data at all, return empty DataFrame
    # this can happen when local cache was empty and the database returned no rows
    if df_raw.empty:
        return df_raw

    # keep only rows inside current rolling window
    # df_raw.index >= target_start creates a boolean mask over timestamp index values
    # df_raw[mask] returns rows where the mask is True
    # this drops rows older than target_start so cache does not grow forever
    df_raw = df_raw[df_raw.index >= target_start]

    # remove duplicate timestamps and sort by time
    # index.duplicated(keep="last") marks older duplicates as True and keeps the newest duplicate as False
    # ~ flips the mask so rows to keep are True
    # keep="last" means if old and new rows have same timestamp, keep the newer merged version
    # sort_index() orders the final raw cache by timestamp
    df_raw = df_raw[~df_raw.index.duplicated(keep="last")].sort_index()

    # build local raw cache file path for this installation
    # get_cache_path returns a Path object like daemon_cache/timeseries_226.parquet
    path = get_cache_path(installation_id)

    # save updated raw cache parquet back to local cache path
    # atomic_save_parquet writes df_raw to that path using the shared safe-save helper
    atomic_save_parquet(df_raw, path)

    # return updated raw cache DataFrame
    return df_raw
