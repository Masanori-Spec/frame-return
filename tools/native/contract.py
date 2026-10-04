"""Fixed, synthetic inputs shared by the CI driver and Scribus Scripter worker."""

SCRIBUS_VERSION = "1.6.1"
SCRIBUS_PACKAGE = "1.6.1-0ubuntu7"
TEXT_NAMES = ("headline", "sidebar", "caption")
IMAGE_NAME = "hero-image"
FONT_BOLD = "DejaVu Sans Bold"
FONT_BOOK = "DejaVu Sans Book"
PRIMARY_STYLE = "HeadlinePrimary"
SECONDARY_STYLE = "HeadlineSecondary"
BASE_RUNS = ["Open ", "studio"]
SHORT_RUNS = ["Community ", "studio"]
LONG_RUNS = ["Community " * 100, "studio"]
CAPTION = "Open studio: unchanged words in a separate native text frame."
ASSET_RELATIVE_PATH = "assets/checker.png"


def public_contract():
    return {
        "schema": "frame-return-native-contract/v1",
        "scribusVersion": SCRIBUS_VERSION,
        "scribusPackage": SCRIBUS_PACKAGE,
        "baseline": "baseline.sla",
        "current": "current.sla",
        "frame": "headline",
        "baselineRuns": BASE_RUNS,
        "cases": {
            "short": {"runs": SHORT_RUNS, "text": "".join(SHORT_RUNS), "overflow": False},
            "long": {"runs": LONG_RUNS, "text": "".join(LONG_RUNS), "overflow": True},
        },
        "baselineGeometry": [40, 48, 200, 48],
        "currentGeometry": [80, 48, 260, 48],
        "baselineSidebar": "18:00",
        "currentSidebar": "18:30",
        "unchangedCaption": CAPTION,
        "asset": ASSET_RELATIVE_PATH,
        "namedStyles": [PRIMARY_STYLE, SECONDARY_STYLE],
        "fontNames": [FONT_BOLD, FONT_BOOK],
    }
