# Connect soultosolebylouise.com

The redesigned website is already public at:
https://soul-to-sole-by-louise.vercel.app

Both soultosolebylouise.com and www.soultosolebylouise.com have been attached to the correct Vercel project. The remaining change is in the domain’s my.host DNS control panel, which is not connected to this workspace.

The root domain currently points to 217.180.14.66 and does not have a certificate matching soultosolebylouise.com. Do not bypass that browser certificate warning. Use the working Vercel link until DNS and HTTPS are ready.

Vercel’s domain inspection on 16 September 2026 specified this root record:

| Type | Name / host | Value |
| --- | --- | --- |
| A | @ | 76.76.21.21 |

Replace the root A record with the value above. Keep the current nameservers and any email/MX records; there is no need to transfer the domain or change email hosting.

Check the linked project’s domain page for validation and the www record:
https://vercel.com/darraghodalaigh-1802s-projects/soul-to-sole-by-louise/settings/domains

After DNS propagates, Vercel will validate the domain and issue HTTPS automatically. Confirm the new homepage opens securely at the custom domain before sharing that address.
