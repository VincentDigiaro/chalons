"""Compatibility entry point; the shared exporter also supports Highwind v5."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('export-highwind-blend.py')), run_name='__main__')
