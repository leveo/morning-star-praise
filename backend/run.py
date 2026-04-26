# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
