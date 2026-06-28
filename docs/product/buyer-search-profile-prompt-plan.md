# Buyer/Search Profile + Prompt Personalization Plan

_Last updated: 2026-06-27. Implemented in `feature/buyer-search-profile-prompts` after PR #18 progressive lead prompts._

## Why this exists

The progressive lead prompt asks for information that a signed-in shopper should also be able to manage later:

- budget range;
- desired villages/areas;
- beds/baths;
- purchase/rent timeline;
- buyer/renter status;
- prequalification status and lender/bank, if they choose;
- whether they are already working with an agent;
- preferred contact method and phone.

Those answers should not live only inside one submitted lead. They should become a durable **buyer/search profile** that can prefill future forms, reduce repeated prompting, and help the brokerage follow up with more relevant context.

Avoid storing direct income unless there is a clear, compliant need. Budget, timeline, and prequalification status are enough for V1 and are less sensitive.

## Product rule

The qualification prompt should be based on whether the shopper has a usable saved search profile.

```text
Anonymous visitor or no saved profile
  -> current progressive search-assist prompt is appropriate.

Signed-in shopper with incomplete profile
  -> prompt should say “Finish your search profile” / “Save your search preferences”.

Signed-in shopper with complete profile
  -> do not show the same long qualification prompt.
  -> either show no prompt, or show a lighter contextual CTA only when it adds value.
```

## V1 data model recommendation

Add a user-owned profile, not just more columns on leads.

Suggested model:

```text
BuyerSearchProfile
  user_id                         required, unique for V1
  brokerage_id                    optional/future tenant context
  preferred_contact_method        phone / text / email
  phone                           optional, copied/prefilled from user profile when present
  prequalified_status             yes / no / in_progress / not_sure
  lender_name                     optional
  purchase_timeline               asap / 1_3_months / 3_6_months / 6_plus_months / just_browsing
  budget_min                      decimal/integer
  budget_max                      decimal/integer
  desired_villages                text or json array
  desired_beds                    integer
  desired_baths                   decimal
  buyer_status                    first_time / upgrading / relocating / investor / renter / military / selling / other
  already_working_with_agent      yes / no / not_sure
  notes                           optional user-facing notes
  completed_at                    timestamp when enough fields are present
  last_prompted_at                optional prompt cadence control
  created_at / updated_at
```

Keep lead qualification fields too. Leads should snapshot the answers that were true at the moment of conversion so CRM history remains accurate even if the shopper later updates their profile.

## API recommendation

Add signed-in consumer endpoints:

```text
GET   /api/v1/me/search_profile
PATCH /api/v1/me/search_profile
```

Rules:

- requires auth;
- user can only read/write their own profile;
- public lead create still cannot spoof `user_id`, `brokerage_id`, `assigned_agent_id`, or internal scoring fields;
- account deletion should delete the buyer/search profile with the user account data;
- existing lead records can remain for brokerage follow-up/audit, but should no longer be linked to the deleted user.

## Web/mobile UX recommendation

### Web

Extend `/account` with a **Search profile** card below contact profile:

- “What are you looking for?”
- budget range;
- desired villages;
- beds/baths;
- timeline;
- buyer/renter status;
- prequalification;
- already working with an agent;
- notes.

Also add a quick CTA from saved searches / saved homes later:

```text
Keep your search profile current so agents can send better matches.
```

### Mobile

Add the same fields in the Account/Profile tab or a dedicated “Search profile” screen:

- compact sections;
- save button pinned or repeated at bottom;
- reuse the same option labels as web;
- prefill showing/price/prompt forms from profile.

## Prompt behavior after search profile exists

### 1. Anonymous shopper

Keep current behavior:

- prompt after enough intent;
- ask for contact + lightweight qualification;
- create normal `search_assist` lead with intent context.

### 2. Signed-in shopper, no/incomplete profile

Prompt copy should shift from “give us your details” to “finish your search profile”.

Example:

```text
Want better matches saved to your account?
Add your budget, villages, and timeline once so Hafa Homes can prefill requests and route your search better.
```

Submission should:

- save/update `BuyerSearchProfile`;
- optionally create a `search_assist` lead only if the shopper explicitly asks for agent help;
- still attach first-party intent context when a lead is created;
- avoid aggressive CRM lead creation for someone simply editing preferences.

### 3. Signed-in shopper, complete profile

Do **not** show the full qualification prompt again.

Better options:

- no prompt;
- or a compact contextual CTA:

```text
Use your saved search profile for this home?
```

This can create a lead/request using the saved profile as prefill, but should not ask all fields again.

### 4. Signed-in shopper whose behavior differs from profile

Prompt only when behavior materially diverges, e.g.:

- repeatedly viewing villages not in saved profile;
- viewing price ranges above/below saved budget;
- switching from rent to sale or sale to rent;
- repeatedly opening larger/smaller homes than saved beds/baths.

Example prompt:

```text
Update your search profile?
You have been looking at homes in Tamuning around $700k–$850k. Want to add that to your saved preferences?
```

This should update the search profile first. Only create a lead if the user asks for agent help.

## How this affects scoring and CRM

- Lead quality scoring can use saved profile values when a signed-in user submits a showing/price/search-assist request.
- Admin lead detail should show both:
  - the **lead snapshot** used for this request;
  - a link/card to the shopper's **current search profile** when available.
- Activity timeline should record profile updates when they affect an existing active lead.

## Privacy and safety rules

- Do not transfer anonymous intent sessions into a signed-in search profile.
- Do not infer sensitive financial facts beyond the fields the user entered or behavior-safe price ranges.
- Do not store income in V1.
- Make all profile fields editable and mostly optional.
- If Google/social login remains on iOS, account deletion must also delete this profile data.
- Public browsing remains unauthenticated.
- Saved homes and search profile remain signed-in/account features.

## Implementation order

1. Add `BuyerSearchProfile` migration/model and consumer API. **Done in follow-up branch.**
2. Add web `/account` Search profile card. **Done in follow-up branch.**
3. Add mobile account Search profile screen/card. **Done in follow-up branch.**
4. Prefill showing, price, and progressive prompt forms from the search profile. **Done in follow-up branch.**
5. Update prompt eligibility/copy:
   - no profile -> current prompt;
   - incomplete profile -> finish profile;
   - complete profile -> suppress long prompt;
   - behavior divergence -> update profile prompt.
   **Done in follow-up branch.**
6. Update lead scoring/serialization/admin lead detail to show profile-backed context safely. **Done via lead snapshots plus staff-only current profile card.**
7. Add tests/smokes for profile privacy, account deletion, prompt suppression, and profile-update prompts. **Smoke covered locally; deeper controller tests can be added with the broader API test suite.**

## Definition of done

- [x] Signed-in shoppers can create/update search profile on web.
- [x] Signed-in shoppers can create/update search profile on mobile.
- [x] Showing/price/search-assist forms prefill from profile.
- [x] Progressive prompt does not show the full qualification form to shoppers with complete profiles.
- [x] Incomplete-profile prompt saves profile without always creating a CRM lead.
- [x] Behavior-divergence prompt updates profile rather than asking the same questions again.
- [x] Lead records snapshot profile answers at submission time.
- [x] Admin CRM can see lead snapshot and current search profile without exposing data to public serializers.
- [x] Account deletion deletes the search profile.
- [x] Anonymous intent sessions remain anonymous and are never transferred into profiles.
