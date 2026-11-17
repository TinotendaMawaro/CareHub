import json

data = json.load(open('C:/Users/tmawa/Documents/GitHub/CareHub/parsed_cost_codes.json'))

def category_for(desc):
    d = desc.lower()
    if 'self-care' in d:
        return 'Self-Care'
    if 'short term accommodation' in d:
        return 'Short Term Accommodation'
    if 'supported independent living' in d or d.strip().startswith('sil'):
        return 'SIL'
    if 'community access' in d or 'community social and rec' in d or 'group activities' in d:
        return 'Community Access'
    if 'employment' in d:
        return 'Employment'
    if 'individualised living' in d:
        return 'Individualised Living'
    if 'psychosocial recovery coaching' in d:
        return 'Recovery Coaching'
    if 'intensive and complex behaviour' in d:
        return 'Behaviour Support'
    if 'delivery of health supports' in d or 'nursing' in d:
        return 'Nursing'
    if 'travel and transport' in d:
        return 'Transport'
    if 'personal domestic' in d:
        return 'Domestic Assistance'
    if 'house or yard maintenance' in d:
        return 'Maintenance'
    if 'house cleaning' in d:
        return 'Cleaning'
    if 'personal training' in d:
        return 'Fitness'
    if 'community engagement' in d:
        return 'Community Engagement'
    if 'capacity building' in d or 'self-management' in d:
        return 'Capacity Building'
    if 'accommodation and tenancy' in d:
        return 'Accommodation'
    if 'life transition' in d:
        return 'Transition Planning'
    if 'skill development' in d or 'skills development and training' in d:
        return 'Skill Development'
    if 'employment assistance' in d:
        return 'Employment'
    if 'social skills development' in d:
        return 'Social Skills'
    if 'transition through school' in d:
        return 'Education'
    if 'training for carers' in d:
        return 'Training'
    if 'unplanned onsite shared supports' in d:
        return 'SDA'
    if 'establishment fee' in d:
        return 'Establishment Fee'
    if 'centre capital cost' in d:
        return 'Capital Cost'
    if 'decision making' in d or 'daily planning' in d or 'budgeting' in d:
        return 'Decision Making'
    if 'individual social skills' in d:
        return 'Social Skills'
    if 'assistance with decision' in d:
        return 'Decision Making'
    return 'Other'

for item in data:
    item['category'] = category_for(item['description'])

lines = [
    '-- NDIS Pricing Schedule 2026-27 Cost Codes Seed',
    '-- Generated from parsed_cost_codes.json',
    '--',
    ''
]

for item in data:
    code = item['code']
    desc = item['description'].replace("'", "''")
    cat = item['category']
    n = item['national_rate']
    r = item['remote_rate']
    v = item['very_remote_rate']
    unit = item['unit']
    
    if unit == 'Hour':
        if 'weekday daytime' in desc.lower() or ('weekday' in desc.lower() and 'evening' not in desc.lower() and 'night' not in desc.lower()):
            wd = f'{n:.2f}'
            ev = 'NULL'
            sat = 'NULL'
            sun = 'NULL'
            ph = 'NULL'
        elif 'weekday evening' in desc.lower():
            wd = 'NULL'
            ev = f'{n:.2f}'
            sat = 'NULL'
            sun = 'NULL'
            ph = 'NULL'
        elif 'weekday night' in desc.lower():
            wd = 'NULL'
            ev = f'{n:.2f}'
            sat = 'NULL'
            sun = 'NULL'
            ph = 'NULL'
        elif 'saturday' in desc.lower():
            wd = 'NULL'
            ev = 'NULL'
            sat = f'{n:.2f}'
            sun = 'NULL'
            ph = 'NULL'
        elif 'sunday' in desc.lower():
            wd = 'NULL'
            ev = 'NULL'
            sat = 'NULL'
            sun = f'{n:.2f}'
            ph = 'NULL'
        elif 'public holiday' in desc.lower():
            wd = 'NULL'
            ev = 'NULL'
            sat = 'NULL'
            sun = 'NULL'
            ph = f'{n:.2f}'
        else:
            wd = f'{n:.2f}'
            ev = 'NULL'
            sat = 'NULL'
            sun = 'NULL'
            ph = 'NULL'
        
        ndis = f'{n:.2f}'
        vals = f'{wd}, {ev}, {sat}, {sun}, {ph}, {ndis}'
    else:
        ndis = f'{n:.2f}'
        vals = f'NULL, NULL, NULL, NULL, NULL, {ndis}'
    
    lines.append(f"INSERT INTO cost_codes (code, description, support_category, weekday_rate, evening_rate, saturday_rate, sunday_rate, public_holiday_rate, ndis_price, active) VALUES ('{code}', '{desc}', '{cat}', {vals}, true);")
    
    def add_remote(suffix, rate_n):
        if rate_n is None:
            return
        lines.append(f"INSERT INTO cost_codes (code, description, support_category, weekday_rate, evening_rate, saturday_rate, sunday_rate, public_holiday_rate, ndis_price, active) VALUES ('{code}', '{desc} {suffix}', '{cat}', {vals.replace(str(n), str(rate_n))}, true);")
    
    add_remote('(Remote)', r)
    add_remote('(Very Remote)', v)

with open('C:/Users/tmawa/Documents/GitHub/CareHub/cost_codes_seed.sql', 'w') as f:
    f.write('\n'.join(lines) + '\n')

print('Regenerated seed SQL with', len(data), 'base codes')
