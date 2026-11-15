# Security Specification — I Love Documents

## 1. Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`files`, `workflows`, `history`) belongs strictly to the authenticated, email-verified user whose `request.auth.uid == userId`.
2. No raw PDF or image binary data is ever stored inside Firestore; `FileRecord` stores metadata only (`fileName`, `mimeType`, `sizeBytes`, `toolUsed`, `retentionMinutes`, optional `downloadToken`).
3. All document IDs (`userId`, `fileId`, `workflowId`, `historyId`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters.
4. Temporal fields (`createdAt`, `updatedAt`) are strictly bound to `request.time`; `createdAt` and `ownerId`/`uid` are immutable on updates.
5. Arrays (`favoriteTools` max 32, `steps` max 10) are bounded and element-type validated.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/u1`.
2. Unverified email (`email_verified: false`) attempting write to `/users/u1/files/f1`.
3. Cross-tenant read (`u2` reading `/users/u1` or `/users/u1/files/f1`).
4. Identity spoofing: `u1` creating `/users/u1/files/f1` with `ownerId: "u2"`.
5. Shadow field injection: `u1` creating `/users/u1` with extra field `isAdmin: true`.
6. Timestamp forging: `u1` creating `/users/u1/history/h1` with backdated `createdAt`.
7. Resource poisoning: `u1` creating `/users/u1/files/f1` with 2KB `fileName` (`> 255`).
8. ID poisoning: `u1` targeting `/users/u1/files/invalid$id*with!badchars`.
9. Immutable field overwrite: `u1` updating `/users/u1/workflows/w1` changing `ownerId` or `createdAt`.
10. Unbounded array attack: `u1` updating `/users/u1` with 100 items in `favoriteTools`.
11. Invalid enum injection: `u1` setting `themeId: "malicious_theme"`.
12. Blanket list scraping: `u2` executing `list` on `/users/u1/files`.
