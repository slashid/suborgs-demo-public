# mypy: ignore-errors

import asyncio
import functools
import logging
import sys
from inspect import signature
from timeit import default_timer as timer
from typing import Callable, ParamSpec, TypeVar


logger = logging.getLogger(__name__)

P = ParamSpec("P")
R = TypeVar("R")


def trace(func: Callable[P, R]) -> Callable[P, R]:
    sig = signature(func)

    @functools.wraps(func)
    def log_decorator_wrapper_sync(*args: P.args, **kwargs: P.kwargs) -> R:
        bound_args = sig.bind(*args, **kwargs)
        args_repr = [f"{k}={v!r}" if k != "token" else f"{k}=[...]" for k, v in bound_args.arguments.items()]

        start = timer()
        try:
            """log return value from the function"""
            value = func(*args, **kwargs)
            elapsed = timer() - start
            logger.info(f"{func.__qualname__}({', '.join(args_repr)}) ->{value!r} ({elapsed:.1f}s)")
            return value
        except Exception:
            """log exception if occurs in function"""
            elapsed = timer() - start
            logger.error(f"{func.__name__}({', '.join(args_repr)}) ->\n\t{str(sys.exc_info()[1])} ({elapsed:.1f}s)")
            raise

    @functools.wraps(func)
    async def log_decorator_wrapper_async(*args: P.args, **kwargs: P.kwargs) -> R:
        bound_args = sig.bind(*args, **kwargs)
        args_repr = [f"{k}={v!r}" if k != "token" else f"{k}=[...]" for k, v in bound_args.arguments.items()]

        start = timer()
        try:
            """log return value from the function"""
            value = await func(*args, **kwargs)
            elapsed = timer() - start
            logger.info(f"{func.__qualname__}({', '.join(args_repr)}) ->{value!r} ({elapsed:.1f}s)")
            return value
        except Exception:
            """log exception if occurs in function"""
            elapsed = timer() - start
            logger.error(f"{func.__name__}({', '.join(args_repr)}) ->\n\t{str(sys.exc_info()[1])} ({elapsed:.1f}s)")
            raise

    if asyncio.iscoroutinefunction(func):
        return log_decorator_wrapper_async
    else:
        return log_decorator_wrapper_sync
