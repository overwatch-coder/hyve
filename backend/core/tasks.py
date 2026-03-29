"""
Smart background task dispatcher for HYVE.

Automatically chooses the best execution strategy:
- Default (USE_CELERY=false): Runs tasks in background threads within
  the same process. Zero extra cost, works on Render free tier.
- Scaled (USE_CELERY=true): Dispatches tasks to a Celery worker via
  Redis. Requires a separate worker process (Render paid / Docker).

Usage:
    from core.tasks import enqueue

    # Dispatch a pipeline function to run in the background
    enqueue(run_url_ingestion_background, product_id, url)
"""
import os
import logging
import threading

logger = logging.getLogger("hyve.tasks")

_USE_CELERY = os.getenv("USE_CELERY", "false").lower() == "true"


def enqueue(func, *args, **kwargs):
    """
    Dispatch a function to run asynchronously in the background.

    When USE_CELERY=true:
        Looks up the matching Celery task by function name and calls .delay().
        Falls back to a thread if Celery dispatch fails.

    When USE_CELERY=false (default):
        Runs the function in a daemon thread (same behavior as
        FastAPI BackgroundTasks, but decoupled from the request lifecycle).
    """
    if _USE_CELERY:
        try:
            from worker import celery_app
            # Convention: Celery tasks are named "worker.task_<func_name>"
            task_name = f"worker.task_{func.__name__}"
            if task_name in celery_app.tasks:
                celery_app.tasks[task_name].delay(*args, **kwargs)
                logger.info(f"[Celery] Dispatched {task_name}")
                return
            else:
                logger.warning(
                    f"[Celery] No registered task '{task_name}', falling back to thread"
                )
        except Exception as e:
            logger.warning(f"[Celery] Dispatch failed, falling back to thread: {e}")

    # Fallback: background thread (works everywhere, zero cost)
    def _run():
        try:
            func(*args, **kwargs)
        except Exception as e:
            logger.error(f"[Thread] Background task {func.__name__} failed: {e}")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    logger.info(f"[Thread] Dispatched {func.__name__} in background thread")
