"""Run a notebook headlessly and write the outputs back into the file.

nbconvert and nbclient are not installed (see CLAUDE.md section 3), so this drives
an ipykernel directly through jupyter_client. It is the runner the retraining
pipeline and anyone re-running a long notebook needs.

Usage:
    py -3.11 tools/run_notebook.py NYCCitiBikeSystemData/01a_eda_data_quality.ipynb
    py -3.11 tools/run_notebook.py <notebook> --timeout 7200 --dry-run

The working directory for the kernel is the notebook's own folder, because every
path inside the notebooks is relative to it.

Execution stops at the first error: a later cell that depends on a failed one
would only produce confusing output. The traceback is stored in the cell and
printed, and the exit code is 1.
"""

import argparse
import os
import queue
import sys
import time
from pathlib import Path

import nbformat
from jupyter_client.manager import KernelManager


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("notebook", type=Path)
    parser.add_argument("--timeout", type=int, default=7200,
                        help="seconds allowed for a single cell (default 7200)")
    parser.add_argument("--dry-run", action="store_true",
                        help="list the code cells without running them")
    parser.add_argument("--start-at", type=int, default=0,
                        help="skip code cells before this index (for resuming)")
    return parser.parse_args()


def collect_output(client, msg_id, cell, timeout):
    """Read messages for one cell until the kernel goes idle again."""
    cell.outputs = []
    finished = False
    saw_error = False
    deadline = time.time() + timeout

    while not finished:
        remaining = deadline - time.time()
        if remaining <= 0:
            raise TimeoutError(f"cell exceeded {timeout} s")
        try:
            msg = client.get_iopub_msg(timeout=min(remaining, 10))
        except queue.Empty:
            # Nothing for ten seconds is normal during a long query; only the
            # deadline above decides that a cell has hung.
            continue

        if msg["parent_header"].get("msg_id") != msg_id:
            continue

        kind = msg["msg_type"]
        content = msg["content"]

        if kind == "status":
            if content["execution_state"] == "idle":
                finished = True
        elif kind == "stream":
            cell.outputs.append(nbformat.v4.new_output("stream",
                                                       name=content["name"],
                                                       text=content["text"]))
            print(content["text"], end="", flush=True)
        elif kind in ("execute_result", "display_data"):
            cell.outputs.append(nbformat.v4.new_output(
                kind, data=content["data"], metadata=content.get("metadata", {})))
        elif kind == "error":
            saw_error = True
            cell.outputs.append(nbformat.v4.new_output(
                "error", ename=content["ename"], evalue=content["evalue"],
                traceback=content["traceback"]))
            print("\n".join(content["traceback"]), flush=True)
        elif kind == "execute_input":
            # The kernel numbers executions from 1; keep it rather than letting
            # the cell fall back to null, which would churn every cell in the
            # diff of a re-run notebook.
            count = content.get("execution_count")
            if count is not None:
                cell.execution_count = count

    return saw_error


def main():
    args = parse_args()
    path = args.notebook.resolve()
    if not path.is_file():
        print(f"ERROR: {path} does not exist")
        return 2

    notebook = nbformat.read(path, as_version=4)
    code_cells = [(i, c) for i, c in enumerate(notebook.cells) if c.cell_type == "code"]

    if args.dry_run:
        for n, (index, cell) in enumerate(code_cells):
            head = next((line for line in cell.source.splitlines() if line.strip()), "")
            print(f"[{n:3}] cell {index:3}: {head[:90]}")
        print(f"\n{len(code_cells)} code cells. Nothing was run.")
        return 0

    # Keep the environment the notebooks expect on Windows (CLAUDE.md section 3).
    env = dict(os.environ, LOKY_MAX_CPU_COUNT="4", PYTHONIOENCODING="utf-8")

    manager = KernelManager(kernel_name="python3")
    manager.start_kernel(cwd=str(path.parent), env=env)
    client = manager.client()
    client.start_channels()

    failed = None
    started = time.time()
    try:
        client.wait_for_ready(timeout=90)
        for n, (index, cell) in enumerate(code_cells):
            if n < args.start_at:
                continue
            head = next((line for line in cell.source.splitlines() if line.strip()), "")
            print(f"\n=== [{n + 1}/{len(code_cells)}] cell {index}: {head[:80]}", flush=True)
            cell_started = time.time()

            msg_id = client.execute(cell.source, allow_stdin=False)
            try:
                saw_error = collect_output(client, msg_id, cell, args.timeout)
            except TimeoutError as error:
                print(f"\nERROR: {error}")
                failed = n
                break

            print(f"    ({time.time() - cell_started:.1f} s)", flush=True)
            if saw_error:
                failed = n
                break
    finally:
        # Always write back: a partial run still carries the outputs produced so
        # far, which is what makes a failure diagnosable.
        nbformat.write(notebook, path)
        client.stop_channels()
        manager.shutdown_kernel(now=True)

    minutes = (time.time() - started) / 60
    if failed is None:
        print(f"\nSUMMARY status=ok notebook={path.name} cells={len(code_cells)} minutes={minutes:.1f}")
        return 0
    print(f"\nSUMMARY status=error notebook={path.name} failed_code_cell={failed} minutes={minutes:.1f}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
