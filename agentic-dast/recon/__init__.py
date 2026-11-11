"""Zero-spec API discovery: role-based Playwright crawler, JS bundle parser, log & probe recon."""

from recon.crawler import (
    DiscoveryResult,
    ReconAgent,
    TrafficRecord,
    extract_api_paths_from_js,
    extract_script_urls_from_html,
    normalize_path,
    parse_traffic_records,
)

__all__ = [
    "DiscoveryResult",
    "ReconAgent",
    "TrafficRecord",
    "extract_api_paths_from_js",
    "extract_script_urls_from_html",
    "normalize_path",
    "parse_traffic_records",
]
