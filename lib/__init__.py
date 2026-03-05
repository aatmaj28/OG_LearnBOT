# Make lib/ a Python package so indexing service can be imported directly.
# The indexing service file has a hyphen in its name (llamaindex-indexing-service.py),
# so we provide a clean import alias: `from lib import indexing_service`

import importlib.util
import os

_dir = os.path.dirname(os.path.abspath(__file__))

# Load llamaindex-indexing-service.py as 'indexing_service'
_spec = importlib.util.spec_from_file_location(
    "indexing_service",
    os.path.join(_dir, "llamaindex-indexing-service.py")
)
indexing_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(indexing_service)
