# Member lifecycle access

- A member deactivated during a month remains visible in Member Management for that month so historical accounting remains understandable.
- From the following month onward, the inactive member is hidden from the Member Management roster.
- Deactivation keeps the member row and historical meals/deposits/cutoff data intact.
- Active workspace selections for the deactivated membership are removed immediately.
- `list_my_workspaces` and `select_workspace` already require an active, non-deleted membership, so the removed workspace cannot be selected again while the member remains inactive.
- The client checks active workspace membership while open and on focus/online/pageshow. If the removed workspace was the account's only workspace, the local session signs out. If other active workspaces exist, the account is moved to or asked to choose another workspace instead of revoking unrelated access.
