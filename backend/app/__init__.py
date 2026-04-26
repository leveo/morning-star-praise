# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 Leo Song
"""Backend app package.

The warnings filter below runs before any submodule is imported, which means
it is in effect by the time FastAPI routers pull in ``google-genai`` /
``yt-dlp`` / etc. and those packages transitively import ``requests``. It
silences the cosmetic ``RequestsDependencyWarning`` raised when a sibling
package (paddlex, in some envs) pins ``chardet`` above requests's
compatibility upper bound — the HTTP path still works fine.
"""

import warnings

warnings.filterwarnings(
    "ignore",
    message=r"urllib3 .* or chardet .*/charset_normalizer .* doesn't match a supported version!",
)
