#!/usr/bin/env python3
"""Parse NDIS Pricing Schedule 2026-27 cost codes from raw text into structured JSON and SQL seed."""

import json
import re
import uuid
from datetime import datetime
from pathlib import Path

# ============================================================
# CONFIGURATION: Replace this with your actual raw text
# ============================================================
RAW_NDIS_TEXT = """
01_011_0107_1_1   Assistance With Self-Care Activities - Standard - Weekday Daytime   Hour   $436.51   $467.69   $467.69
01_011_0107_1_2   Assistance With Self-Care Activities - Standard - Weekday Evening   Hour   $490.23   $521.45   $521.45
01_011_0107_1_3   Assistance With Self-Care Activities - Standard - Weekday Night   Hour   $436.51   $467.69   $467.69
01_011_0107_1_4   Assistance With Self-Care Activities - Standard - Saturday   Hour   $521.89   $553.12   $553.12
01_011_0107_1_5   Assistance With Self-Care Activities - Standard - Sunday   Hour   $607.34   $638.56   $638.56
01_011_0107_1_6   Assistance With Self-Care Activities - Standard - Public Holiday   Hour   $692.78   $724.01   $724.01
01_011_0108_1_1   Assistance With Self-Care Activities - Standard - Weekday Daytime   Each   $87.30   $93.54   $93.54
01_011_0110_1_1   Assistance With Self-Care Activities - Higher Intensities - Weekday Daytime   Hour   $56.69   $60.66   $60.66
01_011_0110_1_2   Assistance With Self-Care Activities - Higher Intensities - Weekday Evening   Hour   $64.89   $69.41   $69.41
01_011_0110_1_3   Assistance With Self-Care Activities - Higher Intensities - Saturday   Hour   $82.04   $87.73   $87.73
01_011_0110_1_4   Assistance With Self-Care Activities - Higher Intensities - Sunday   Hour   $105.38   $112.73   $112.73
01_011_0110_1_5   Assistance With Self-Care Activities - Higher Intensities - Public Holiday   Hour   $128.71   $137.73   $137.73
01_012_0120_1_1   Assistance With Travel and Transport - Weekday Daytime   Hour   $35.82   $38.31   $38.31
01_012_0120_1_2   Assistance With Travel and Transport - Saturday   Hour   $44.20   $47.27   $47.27
01_012_0120_1_3   Assistance With Travel and Transport - Sunday   Hour   $57.12   $61.07   $61.07
01_012_0120_1_4   Assistance With Travel and Transport - Public Holiday   Hour   $70.04   $74.88   $74.88
01_013_0130_1_1   Community Access - Standard - Weekday Daytime   Hour   $65.11   $69.67   $69.67
01_013_0130_1_2   Community Access - Standard - Saturday   Hour   $81.39   $87.04   $87.04
01_013_0130_1_3   Community Access - Standard - Sunday   Hour   $104.98   $112.28   $112.28
01_013_0130_1_4   Community Access - Standard - Public Holiday   Hour   $128.57   $137.53   $137.53
01_013_0131_1_1   Community Access - Higher Intensities - Weekday Daytime   Hour   $73.35   $78.49   $78.49
01_013_0131_1_2   Community Access - Higher Intensities - Saturday   Hour   $91.69   $98.07   $98.07
01_013_0131_1_3   Community Access - Higher Intensities - Sunday   Hour   $118.23   $126.45   $126.45
01_013_0131_1_4   Community Access - Higher Intensities - Public Holiday   Hour   $144.78   $154.79   $154.79
01_014_0140_1_1   Short Term Accommodation - Standard - Weekday Daytime   Day   $456.21   $487.45   $487.45
01_014_0140_1_2   Short Term Accommodation - Standard - Saturday   Day   $547.45   $584.94   $584.94
01_014_0140_1_3   Short Term Accommodation - Standard - Sunday   Day   $638.69   $682.42   $682.42
01_014_0140_1_4   Short Term Accommodation - Standard - Public Holiday   Day   $729.94   $779.91   $779.91
01_014_0141_1_1   Short Term Accommodation - Higher Intensity - Weekday Daytime   Day   $598.34   $639.44   $639.44
01_014_0141_1_2   Short Term Accommodation - Higher Intensity - Saturday   Day   $718.01   $767.33   $767.33
01_014_0141_1_3   Short Term Accommodation - Higher Intensity - Sunday   Day   $837.68   $895.22   $895.22
01_014_0141_1_4   Short Term Accommodation - Higher Intensity - Public Holiday   Day   $957.34   $1,023.10   $1,023.10
01_015_0150_1_1   Supported Independent Living (SIL) - Standard - Weekday Daytime   Day   $412.56   $440.78   $440.78
01_015_0150_1_2   Supported Independent Living (SIL) - Standard - Saturday   Day   $495.07   $529.14   $529.14
01_015_0150_1_3   Supported Independent Living (SIL) - Standard - Sunday   Day   $577.59   $617.49   $617.49
01_015_0150_1_4   Supported Independent Living (SIL) - Standard - Public Holiday   Day   $660.10   $705.85   $705.85
01_015_0151_1_1   Supported Independent Living (SIL) - Higher Intensity - Weekday Daytime   Day   $534.33   $571.18   $571.18
01_015_0151_1_2   Supported Independent Living (SIL) - Higher Intensity - Saturday   Day   $641.19   $684.42   $684.42
01_015_0151_1_3   Supported Independent Living (SIL) - Higher Intensity - Sunday   Day   $748.06   $798.65   $798.65
01_015_0151_1_4   Supported Independent Living (SIL) - Higher Intensity - Public Holiday   Day   $854.92   $913.89   $913.89
01_016_0160_1_1   Group and Centre Based Activities - Standard - Weekday Daytime   Hour   $48.92   $52.33   $52.33
01_016_0160_1_2   Group and Centre Based Activities - Standard - Saturday   Hour   $61.15   $65.42   $65.42
01_016_0160_1_3   Group and Centre Based Activities - Standard - Sunday   Hour   $78.94   $84.44   $84.44
01_016_0160_1_4   Group and Centre Based Activities - Standard - Public Holiday   Hour   $96.72   $103.47   $103.47
01_017_0170_1_1   Individualised Living Options - Weekday Daytime   Hour   $58.73   $62.83   $62.83
01_017_0170_1_2   Individualised Living Options - Saturday   Hour   $73.41   $78.54   $78.54
01_017_0170_1_3   Individualised Living Options - Sunday   Hour   $94.69   $101.27   $101.27
01_017_0170_1_4   Individualised Living Options - Public Holiday   Hour   $115.98   $124.00   $124.00
"""


def parse_ndis_text(raw_text: str):
    lines = raw_text.strip().splitlines()
    entries = []
    pattern = re.compile(
        r"^(\d{2}_\d{3}_\d{4}_\d_\d)\s+(.+?)\s+(Hour|Each|Day|Week)\s+\$([0-9,]+\.\d{2})\s+\$([0-9,]+\.\d{2})\s+\$([0-9,]+\.\d{2})$"
    )
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        m = pattern.match(line)
        if not m:
            continue
        
        code = m.group(1)
        description = m.group(2).strip()
        unit = m.group(3)
        national_rate = float(m.group(4).replace(",", ""))
        remote_rate = float(m.group(5).replace(",", ""))
        very_remote_rate = float(m.group(6).replace(",", ""))
        
        category = derive_category(description)
        
        entry = {
            "code": code,
            "description": description,
            "unit": unit,
            "national_rate": national_rate,
            "remote_rate": remote_rate,
            "very_remote_rate": very_remote_rate,
            "category": category,
        }
        entries.append(entry)
    
    return entries


def derive_category(description: str) -> str:
    desc_lower = description.lower()
    if "short term accommodation" in desc_lower:
        return "Short Term Accommodation"
    if "supported independent living" in desc_lower or desc_lower.strip().startswith("sil"):
        return "SIL"
    if "self-care" in desc_lower:
        return "Self-Care"
    if "community access" in desc_lower or "group and centre" in desc_lower or "centre based activities" in desc_lower:
        return "Community Access"
    if "travel and transport" in desc_lower:
        return "Transport"
    if "individualised living" in desc_lower:
        return "Individualised Living"
    if "therapeutic supports" in desc_lower:
        return "Therapeutic Supports"
    if "behaviour support" in desc_lower:
        return "Behaviour Support"
    if "daily life" in desc_lower:
        return "Daily Living"
    if "employment" in desc_lower:
        return "Employment"
    if "nursing" in desc_lower or "health" in desc_lower:
        return "Nursing/Health"
    if "specialist disability accommodation" in desc_lower or "sda" in desc_lower:
        return "SDA"
    return "Other"


def map_rate_to_sql_columns(description: str, national_rate: float):
    """Map the description keywords to the appropriate rate columns."""
    desc_lower = description.lower()
    
    weekday_rate = None
    evening_rate = None
    saturday_rate = None
    sunday_rate = None
    public_holiday_rate = None
    ndis_price = None
    notes = []
    
    if "weekday daytime" in desc_lower:
        weekday_rate = national_rate
    elif "weekday evening" in desc_lower:
        evening_rate = national_rate
    elif "weekday night" in desc_lower or ("night" in desc_lower and "weekday" in desc_lower):
        evening_rate = national_rate
        notes.append("Night rate mapped to evening_rate column")
    elif "saturday" in desc_lower:
        saturday_rate = national_rate
    elif "sunday" in desc_lower:
        sunday_rate = national_rate
    elif "public holiday" in desc_lower:
        public_holiday_rate = national_rate
    elif "weekday" in desc_lower:
        weekday_rate = national_rate
    
    if any(x in description.lower() for x in ["each", "day", "week"]):
        ndis_price = national_rate
    
    if "sleepover" in description.lower():
        weekday_rate = national_rate
        notes.append("Sleepover rate mapped to weekday_rate")
    
    return {
        "weekday_rate": weekday_rate,
        "evening_rate": evening_rate,
        "saturday_rate": saturday_rate,
        "sunday_rate": sunday_rate,
        "public_holiday_rate": public_holiday_rate,
        "ndis_price": ndis_price,
        "notes": notes,
    }


def generate_sql(entries):
    """Generate INSERT statements for the cost_codes table."""
    lines = []
    lines.append("-- NDIS Pricing Schedule 2026-27 Cost Codes Seed")
    lines.append(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("--")
    lines.append("")
    
    for entry in entries:
        mapping = map_rate_to_sql_columns(entry["description"], entry["national_rate"])
        
        variants = [(entry["national_rate"], "")]
        if entry.get("remote_rate") is not None:
            variants.append((entry["remote_rate"], " (Remote)"))
        if entry.get("very_remote_rate") is not None:
            variants.append((entry["very_remote_rate"], " (Very Remote)"))
        
        for rate, suffix in variants:
            id_val = str(uuid.uuid4())
            code = entry["code"]
            desc = entry["description"] + suffix
            cat = entry["category"]
            
            m = map_rate_to_sql_columns(entry["description"], rate)
            wd = f"{m['weekday_rate']:.2f}" if m["weekday_rate"] is not None else "NULL"
            ev = f"{m['evening_rate']:.2f}" if m["evening_rate"] is not None else "NULL"
            sa = f"{m['saturday_rate']:.2f}" if m["saturday_rate"] is not None else "NULL"
            su = f"{m['sunday_rate']:.2f}" if m["sunday_rate"] is not None else "NULL"
            ph = f"{m['public_holiday_rate']:.2f}" if m["public_holiday_rate"] is not None else "NULL"
            np = f"{m['ndis_price']:.2f}" if m["ndis_price"] is not None else "NULL"
            
            desc_escaped = desc.replace("'", "''")
            
            insert = (
                f"INSERT INTO cost_codes (id, code, description, support_category, "
                f"weekday_rate, evening_rate, saturday_rate, sunday_rate, "
                f"public_holiday_rate, ndis_price, active) "
                f"VALUES ('{id_val}', '{code}', '{desc_escaped}', '{cat}', "
                f"{wd}, {ev}, {sa}, {su}, {ph}, {np}, true);"
            )
            lines.append(insert)
            
            if m["notes"]:
                for note in m["notes"]:
                    lines.append(f"-- Note: {note} for {code}{suffix}")
        
        lines.append("")
    
    return "\n".join(lines)


def main():
    output_dir = Path(r"C:\Users\tmawa\Documents\GitHub\CareHub")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    json_path = output_dir / "parsed_cost_codes.json"
    sql_path = output_dir / "cost_codes_seed.sql"
    
    entries = parse_ndis_text(RAW_NDIS_TEXT)
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)
    
    sql_content = generate_sql(entries)
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write(sql_content)
    
    print(f"Parsed {len(entries)} cost codes.")
    print(f"JSON written to: {json_path}")
    print(f"SQL written to: {sql_path}")


if __name__ == "__main__":
    main()
