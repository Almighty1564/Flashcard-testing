"""Test-only polling through the automation protocol; keeps the application CSP intact."""
import time


def wait_ready(page, expression, timeout=30):
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            value = page.evaluate("() => (" + expression + ")")
            if value:
                return value
        except Exception as error:
            last_error = error
        page.wait_for_timeout(50)
    raise AssertionError("Browser condition timed out: " + expression) from last_error
