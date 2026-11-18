-- Version 2 of the user policies. {{organisation}} is replaced with the organisation's name
-- when shown. These are starting templates: have them reviewed by a legal adviser before relying
-- on them. Publishing a new version asks everyone it applies to to accept it again.

insert into public.legal_documents (kind, audience, version, title, body) values
('privacy', 'all', 2, 'Privacy Notice', $doc$
# Privacy Notice

{{organisation}} uses CareHub to plan, deliver and record care and support. This notice explains what personal information we hold, why, and your choices. We handle personal information under the Privacy Act 1988 (Cth), the Australian Privacy Principles and, for NDIS supports, the NDIS Practice Standards.

## What we collect
- **Your account:** name, email, phone, role and profile photo.
- **Work records:** shifts, clock-in and clock-out times, breaks, timesheets and pay details.
- **Location:** your phone's location only at the moment you start or end a shift, to confirm you are at the client's address. CareHub does not track you between those moments.
- **Care records:** shift notes, incident reports, documents and messages you write or upload.
- **Clients:** contact details, plans, care needs and other health information needed to provide safe support.

## Why we use it
- To roster and deliver supports safely, and to pay staff and invoice correctly.
- To meet our legal, NDIS and insurance obligations, including incident reporting.
- To keep the system secure, for example by logging sign-ins.

## Who can see it
- Office staff see what they need to run the service.
- Support staff see their own records and the care details of clients they support.
- We share information outside {{organisation}} only when the law requires it, with your consent, or with service providers who host CareHub for us under confidentiality obligations.

## How long we keep it
Records are kept for as long as the law requires. NDIS and employment records are generally kept for at least 7 years, then securely deleted.

## Your rights
You can ask to see or correct your personal information. If you have a privacy concern, contact {{organisation}} first. If you are not satisfied with our response, you can complain to the Office of the Australian Information Commissioner (oaic.gov.au).

## Data breaches
If a breach is likely to cause serious harm, we will notify you and the OAIC as required by the Notifiable Data Breaches scheme.
$doc$),

('terms', 'staff', 2, 'Staff Terms of Use', $doc$
# Staff Terms of Use

These terms apply when you use the CareHub app to work for {{organisation}}.

## Your account
- Your login is for you only. Never share your password or let someone else use your account.
- Keep your phone locked with a PIN, fingerprint or face ID. Turn on two-factor authentication in the app.
- Tell the office straight away if your phone is lost or you think someone has used your account.

## Starting and ending shifts
- Start and end shifts at the client's location, at the real times you begin and finish.
- Never start or end a shift for someone else, and never record times you did not work.
- If you forget or can't clock in or out, tell the office so they can correct it. Don't guess.

## Notes and incidents
- Write a shift note for every client before you end each shift: factual, respectful and clear.
- Report incidents, injuries and concerns in the app as soon as it is safe to do so, and phone the office for anything urgent.

## Client information
- Only look at information for clients you support, and only for your work.
- Don't screenshot, copy, print or share client information outside CareHub.

## Documents
Keep your checks and certificates current. Upload renewals before they expire; you may not be rostered while a required check has lapsed.

Breaching these terms may lead to your access being removed and to disciplinary action.
$doc$),

('code_of_conduct', 'staff', 2, 'Staff Code of Conduct', $doc$
# Staff Code of Conduct

{{organisation}} follows the NDIS Code of Conduct. When providing supports, you must:

1. Act with respect for individual rights to freedom of expression, self-determination and decision-making, in line with relevant laws and conventions.
2. Respect the privacy of people with disability.
3. Provide supports and services in a safe and competent manner, with care and skill.
4. Act with integrity, honesty and transparency.
5. Promptly take steps to raise and act on concerns about matters that might affect the quality and safety of supports.
6. Take all reasonable steps to prevent and respond to all forms of violence against, and exploitation, neglect and abuse of, people with disability.
7. Take all reasonable steps to prevent and respond to sexual misconduct.

## In practice
- Treat every client as the expert in their own life. Ask, listen, and support their choices.
- Keep professional boundaries. Do not accept money or significant gifts, and do not contact clients on personal social media.
- Work only within your training. If you are unsure, stop and ask the office.
- Report any concern about a client's safety immediately, even if you are not certain.
- Never attend work affected by alcohol or drugs.

Breaches of the Code may be reported to the NDIS Quality and Safeguards Commission.
$doc$),

('terms', 'office', 2, 'Office Terms of Use', $doc$
# Office Terms of Use

These terms apply when you use the CareHub web dashboard for {{organisation}}.

## Access
- Your account is personal. Never share it or sign in for someone else.
- Use two-factor authentication. Administrators may require it for all office accounts.
- Lock your screen when you step away, and sign out on shared computers.

## Using information
- Access only the client and staff records you need for your current task.
- Keep records accurate. Correct mistakes rather than deleting history.
- Approve timesheets and shifts only after checking the recorded times and notes.

## Exports and sharing
- Exported files (invoices, timesheets, reports) contain personal information. Store them only in approved locations and delete local copies when you are done.
- Share information outside {{organisation}} only when you are authorised to.

## Changes and roles
Administrators control roles, prices and security settings. Changes are recorded.

Misuse of CareHub may lead to access being removed and to disciplinary or legal action.
$doc$),

('confidentiality', 'office', 2, 'Confidentiality and Acceptable Use', $doc$
# Confidentiality and Acceptable Use

## Confidential information
Client health information, plans, incident reports, staff details, pay rates and business information are confidential. You must:
- Use them only for your work at {{organisation}}.
- Never disclose them to anyone not authorised to receive them, during or after your employment.
- Discuss clients only with people involved in their support, and never in public.

## Acceptable use
- Don't try to access data or features beyond your role, or test the system's security without written permission.
- Don't upload unlawful, offensive or unrelated material.
- Don't install software or connect devices that could put CareHub data at risk.

## Reporting
Report any suspected data breach, lost device or misuse to an administrator immediately. {{organisation}} must assess and, where required, notify breaches under the Notifiable Data Breaches scheme.

These obligations continue after you leave {{organisation}}.
$doc$)
on conflict (kind, audience, version) do nothing;
