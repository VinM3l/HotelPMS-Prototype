#!/bin/bash
# HotelPMS Launcher — macOS / Linux
# Double-click this file (or run it in Terminal) to start the app.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8765

echo ""
echo "  =========================================="
echo "   🏨  Hotel PMS — Starting server..."
echo "  =========================================="
echo ""

# Check for Python 3
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo "  Python not found. Opening file directly..."
    if command -v open &>/dev/null; then
        open "$SCRIPT_DIR/index.html"
    else
        xdg-open "$SCRIPT_DIR/index.html"
    fi
    exit 0
fi

echo "  Using: $($PYTHON --version)"
echo "  URL  : http://localhost:$PORT"
echo "  Tip  : Keep this window open. Close it to stop the server."
echo ""

$PYTHON "$SCRIPT_DIR/launch_server.py"
