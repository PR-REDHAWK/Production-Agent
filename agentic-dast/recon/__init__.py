"""Zero-spec API discovery: role-based Playwright crawler, JS bundle parser, log & probe recon."""

from recon.crawler import (
    DiscoveryResult,
    ReconAgent,
    extract_api_paths_from_js,
    extract_script_urls_from_html,
    normalize_path,
)

__all__ = [
    "DiscoveryResult",
    "ReconAgent",
    "extract_api_paths_from_js",
    "extract_script_urls_from_html",
    "normalize_path",
]
