# os is used for environment variables and atomic local file replacement.
# os.getenv(...) reads settings like S3_STATES_BUCKET_PATH from the process environment.
# os.replace(...) swaps a finished temporary file into the real state-file path.
import os

# json converts between Python dictionaries and JSON text files.
# json.load(...) reads JSON text into a dict; json.dump(...) writes a dict as JSON text.
import json

# logging records load/save failures without crashing the whole daemon.
# logging.error(...) writes an error message to the configured logs.
import logging

# fsspec gives one filesystem interface for local files and S3 files.
# fsspec.core.url_to_fs(path) returns an fs object with exists(...) and open(...) methods.
import fsspec

# Path is used to build local state-directory paths safely.
# Path(storage_dir) creates a path object; local_dir / filename joins path pieces.
from pathlib import Path

# datetime is used for stored timestamps like last_weather_time.
# timezone.utc marks fallback/default times as UTC-aware instead of timezone-naive.
from datetime import datetime, timezone


class InstallationState:
    """
    State manager for one installation.

    It keeps a Python dict copy in RAM as self.state.
    It writes this state to S3/local disk only when save() is called.
    """

    def __init__(self, installation_id, storage_dir="Main_APP/daemon_states"):
        # store installation_id as a real object attribute
        # this tells the state object which installation it belongs to
        # because __setattr__ is customized below, this assignment passes through __setattr__
        # installation_id is protected there, so it is stored as a normal object attribute
        self.installation_id = installation_id

        # get S3_STATES_BUCKET_PATH value from environment variables
        # os.getenv("NAME") returns the environment variable string if it exists, otherwise None
        # if this returns a value, the state file is stored in S3; if not, local disk is used
        s3_path = os.getenv("S3_STATES_BUCKET_PATH")

        # if this value exists, use S3 mode for storing state files
        # a non-empty string is truthy in Python, so if s3_path: means "did we get a usable env value?"
        if s3_path:
            # remember that this state file should be saved through S3/fsspec
            # is_s3 is protected in __setattr__, so this becomes a real attribute, not self.state["is_s3"]
            self.is_s3 = True
            # Example: s3://my-bucket/states/state_226.json
            # create the S3 filepath where this installation state JSON will live
            # f-string inserts s3_path and installation_id into one path string
            self.filepath = f"s3://{s3_path}/state_{self.installation_id}.json"
        else:
            # if S3_STATES_BUCKET_PATH is missing, use a local folder instead
            self.is_s3 = False
            # create a Path object for the local state directory
            # Path(storage_dir) does not create the directory yet; it only represents the path in RAM
            local_dir = Path(storage_dir)

            # create this directory if it does not already exist
            # parents=True means create missing parent folders too
            # exist_ok=True means do not crash if the directory already exists
            local_dir.mkdir(parents=True, exist_ok=True)
            # create the local filepath where this installation state JSON will live
            # local_dir / filename joins path pieces; str(...) converts Path to normal string for fsspec/open calls
            self.filepath = str(local_dir / f"state_{self.installation_id}.json")

        # look at self.filepath and choose the right filesystem object
        # s3://... paths get an S3 filesystem; normal paths get a local filesystem
        # fsspec.core.url_to_fs(...) returns two values: filesystem object and path-within-filesystem detail
        # self.fs stores the filesystem object, and _ means "ignore the second returned value"
        # fsspec lets later code use similar open/exists calls for both places
        self.fs, _ = fsspec.core.url_to_fs(self.filepath)

        # create default state for this installation in RAM
        # saved JSON values, if any, will be merged into this dict in load()
        # installation_id stores which installation this state belongs to
        # best_production_model tells prediction code which production model to prefer
        # best_consumption_model tells consumption code which load model to prefer
        # physical_params stores learned/static installation parameters like tilt/azimuth/capacity
        # has_physical_params tells orchestrator whether physical analysis already succeeded at least once
        self.state = {
            "installation_id": self.installation_id,
            "best_production_model": "default_solar",
            "best_consumption_model": "default_load",
            "physical_params": {},
            "has_physical_params": False,
        }

        # call load(); if a state file already exists, it updates self.state with saved values
        # after this line, self.state contains defaults overwritten by any previously saved JSON values
        self.load()

    def __setattr__(self, name, value):
        # this runs whenever Python code assigns an attribute, for example: state.x = value
        # Python normally stores attributes in self.__dict__, but this method intercepts assignment first
        # name is the attribute name being assigned, and value is the value being assigned
        protected = ["installation_id", "filepath", "state", "is_s3", "fs"]

        # these names are real object attributes, so they should not be redirected into self.state
        # name in protected checks if the assignment is for InstallationState's own internal machinery
        # hasattr(self.__class__, name) is true for properties/methods defined on this class
        # example: state.last_analysis_time = dt should use the property setter
        if name in protected or hasattr(self.__class__, name):
            # use normal Python assignment for real attributes and class properties
            # super().__setattr__(name, value) calls the default object assignment behavior
            # for property setters, this lets Python invoke the setter method instead of writing self.state directly
            super().__setattr__(name, value)
        else:
            # any other name is stored inside the in-memory state dict
            # example: state.best_production_model = "x" becomes self.state["best_production_model"] = "x"
            # important: this changes RAM only; the JSON file is updated only after save()
            self.state[name] = value

    def __getattr__(self, name):
        # this runs only if normal attribute lookup did not find the name
        # normal lookup checks real attributes/properties first; only missing names arrive here
        # name is the attribute the caller tried to read, for example "best_production_model"
        # if self.state exists and has this key, return it like an attribute
        # "state" in self.__dict__ protects early initialization before self.state has been created
        # example: state.best_production_model reads self.state["best_production_model"]
        if "state" in self.__dict__ and name in self.state:
            return self.state[name]

        # if the key is not in self.state either, raise normal AttributeError
        # AttributeError tells Python/caller "this object really does not have that attribute"
        raise AttributeError(
            f"'{type(self).__name__}' object has no attribute '{name}'"
        )

    def load(self):
        # check if the state file exists in the selected filesystem, local or S3
        # self.fs.exists(self.filepath) returns True/False using the fsspec filesystem selected in __init__
        # if there is no saved file yet, this function leaves the default self.state unchanged
        if self.fs.exists(self.filepath):
            try:
                # open saved state file in read mode as UTF-8 text
                # self.fs.open(...) works for both local files and S3 objects through fsspec
                # "r" means read text; encoding="utf-8" tells Python how to decode bytes into text
                # the with block closes the file automatically when reading finishes or errors
                with self.fs.open(self.filepath, "r", encoding="utf-8") as f:
                    # json.load reads JSON text from file and converts it into a Python dict
                    # f is the already-open file object; json.load consumes its contents
                    disk_state = json.load(f)
                    # update current default state with values loaded from disk/S3
                    # dict.update(...) mutates self.state in RAM
                    # if the same key exists in both places, saved value wins
                    self.state.update(disk_state)
            # if loading fails, log the error but do not stop the daemon
            # the object continues using default state values already created in __init__
            except Exception as e:
                logging.error(f"Failed to load state for {self.installation_id}: {e}")

    def save(self):
        # if S3 mode is active, write the state JSON directly through fsspec
        # self.is_s3 was chosen in __init__ based on S3_STATES_BUCKET_PATH environment variable
        if self.is_s3:
            # open the S3 state file in write mode as UTF-8 text
            # self.fs.open(...) uses the S3 filesystem object returned by fsspec.core.url_to_fs(...)
            # "w" means overwrite/write text at self.filepath
            with self.fs.open(self.filepath, "w", encoding="utf-8") as f:
                # json.dump converts self.state dict to JSON text and writes it to this file
                # first argument is the Python dict to serialize
                # second argument is the open file object to write into
                # indent=4 makes the saved JSON easier to read
                json.dump(self.state, f, indent=4)
        else:
            # if we use local files, first write to a temporary file
            # this is safer than writing directly to the real state file
            # if the process crashes while writing temp file, the old real file is still untouched
            temp_path = self.filepath + ".tmp"
            try:
                # open temporary file in write mode as UTF-8 text
                # built-in open(...) is used here because local mode writes to normal disk path
                # the with block closes the temporary file before os.replace(...) swaps it into place
                with open(temp_path, "w", encoding="utf-8") as f:
                    # write self.state dict as pretty-printed JSON into temporary file
                    # json.dump serializes only JSON-compatible values like strings, numbers, bools, dicts and lists
                    json.dump(self.state, f, indent=4)

                # replace the old real state file with the finished temporary file
                # os.replace(src, dst) moves temp_path over self.filepath
                # os.replace is atomic on local filesystem: it swaps whole files, not partial content
                # after this line succeeds, readers see either the old complete file or the new complete file
                os.replace(temp_path, self.filepath)
            # if local saving fails, log the error
            # this function currently does not delete a leftover .tmp file on failure
            except Exception as e:
                logging.error(f"Local state save failed: {e}")

    # EXPLICIT DATE PARSERS
    # JSON files cannot store datetime objects directly.
    # These helpers convert between datetime objects in Python and ISO strings in self.state.
    def _parse_time(self, key):
        # get raw value stored under this key in self.state
        # self.state.get(key) returns the saved value, or None if the key does not exist
        # key is a string like "last_weather_time" or "last_evaluation_time"
        val = self.state.get(key)

        # if value exists, it should be an ISO datetime string
        # ISO string example: "2026-06-03T22:00:00+00:00"
        if val:
            # convert ISO string back into a Python datetime object
            # datetime.fromisoformat(val) parses the text created earlier by dt_obj.isoformat()
            # the returned datetime is what orchestrator can subtract from now_utc
            return datetime.fromisoformat(val)

        # if no time is saved yet, return earliest possible datetime in UTC timezone
        # datetime.min is year 1 with no timezone by default
        # .replace(tzinfo=timezone.utc) attaches UTC timezone so comparisons with now_utc are safe
        # this makes "never run before" look extremely old, so conditional jobs run on first cycle
        return datetime.min.replace(tzinfo=timezone.utc)

    def _set_time(self, key, dt_obj):
        # if caller passed a datetime object
        # truthy check means None/False values do not overwrite an existing stored time
        if dt_obj:
            # convert it to ISO string because JSON cannot store datetime objects directly
            # dt_obj.isoformat() returns text like "2026-06-03T22:00:00+00:00"
            # writing self.state[key] changes RAM only; save() is still needed to persist to file/S3
            self.state[key] = dt_obj.isoformat()

    @property
    def last_analysis_time(self):
        # allow code to read state.last_analysis_time
        # orchestrator uses this to decide whether physical installation analysis should run again
        # internally this reads self.state["last_analysis_time"] and parses it into datetime
        return self._parse_time("last_analysis_time")

    @last_analysis_time.setter
    def last_analysis_time(self, val):
        # allow code to assign state.last_analysis_time = some_datetime
        # val should be a datetime object, usually now_utc from orchestrator
        # internally this stores ISO string in self.state["last_analysis_time"]
        self._set_time("last_analysis_time", val)

    @property
    def last_weather_time(self):
        # allow code to read state.last_weather_time
        # orchestrator uses this to decide whether the weather cache should be refreshed again
        # internally this reads self.state["last_weather_time"] and parses ISO text into datetime
        return self._parse_time("last_weather_time")

    @last_weather_time.setter
    def last_weather_time(self, val):
        # allow code to assign state.last_weather_time = now_utc after weather fetch succeeds
        # val should be a datetime object; _set_time stores it as ISO text in self.state
        self._set_time("last_weather_time", val)

    @property
    def last_benchmark_time(self):
        # allow code to read state.last_benchmark_time
        # this timestamp can be used to decide whether benchmark/comparison work is due
        # internally this reads self.state["last_benchmark_time"] and returns a datetime
        return self._parse_time("last_benchmark_time")

    @last_benchmark_time.setter
    def last_benchmark_time(self, val):
        # allow code to assign state.last_benchmark_time = some_datetime
        # _set_time converts the datetime to JSON-safe ISO text in self.state
        self._set_time("last_benchmark_time", val)

    @property
    def last_production_prediction_time(self):
        # allow code to read state.last_production_prediction_time
        # production predictor can use this to know when forward production predictions were last refreshed
        # internally this reads self.state["last_production_prediction_time"] and parses it into datetime
        return self._parse_time("last_production_prediction_time")

    @last_production_prediction_time.setter
    def last_production_prediction_time(self, val):
        # allow code to assign state.last_production_prediction_time = some_datetime
        # _set_time stores the timestamp under the matching self.state key as ISO text
        self._set_time("last_production_prediction_time", val)

    @property
    def last_sarimax_train(self):
        # allow code to read state.last_sarimax_train
        # consumption model training can use this to decide whether SARIMAX retraining is due
        # internally this reads self.state["last_sarimax_train"] and returns a datetime
        return self._parse_time("last_sarimax_train")

    @last_sarimax_train.setter
    def last_sarimax_train(self, val):
        # allow code to assign state.last_sarimax_train = some_datetime after training
        # _set_time writes the ISO string into self.state; save() persists it later
        self._set_time("last_sarimax_train", val)

    @property
    def last_evaluation_time(self):
        # allow code to read state.last_evaluation_time
        # orchestrator uses this to decide when periodic prediction backtesting/evaluation should run
        # internally this reads self.state["last_evaluation_time"] and parses it into datetime
        return self._parse_time("last_evaluation_time")

    @last_evaluation_time.setter
    def last_evaluation_time(self, val):
        # allow code to assign state.last_evaluation_time = now_utc after successful evaluation
        # _set_time stores the timestamp as JSON-safe ISO text in self.state
        self._set_time("last_evaluation_time", val)

    # PHYSICAL PARAMS
    def update_physical_params(self, params_dict):
        """Update stored physical parameters in RAM. Call save() outside to persist."""
        # params_dict is a dictionary of newly calculated physical parameters
        # example keys can be tilt, azimuth, capacity or other installation-specific values
        # merge new values into existing physical_params dict
        # dict.update(params_dict) mutates the existing self.state["physical_params"] dictionary in RAM
        # existing keys stay unless params_dict contains the same key and overwrites them
        self.state["physical_params"].update(params_dict)

        # this assignment goes through __setattr__
        # because has_physical_params is not protected, it writes self.state["has_physical_params"] = True
        # this tells orchestrator future cycles can treat physical analysis as already available
        # important: this is still RAM-only until save() is called by the caller
        self.has_physical_params = True

    def get_physical_params(self):
        # get physical_params from state
        # self.state.get("physical_params", {}) returns stored dict if present, otherwise a new empty dict fallback
        # if key is missing for some reason, return empty dict
        # this function just returns stored values; it does not convert Decimal/float values
        # callers usually merge this dict into database configuration to build master_params
        return self.state.get("physical_params", {})
