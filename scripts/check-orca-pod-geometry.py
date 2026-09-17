"""Compatibility entry point for the detailed rear launcher geometry checks."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('check-orca-rear-tubes.py')), run_name='__main__')
