"""Logger shim for ported JustHireMe modules.

Originally: `from logger import get_logger` (module at backend root in JH repo).
Adapted: `from .logger import get_logger` after vendoring under our agents/ tree.
"""
import logging


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
