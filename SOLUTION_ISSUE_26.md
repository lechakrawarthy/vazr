# Solution for Issue #26

## 🛠️ Proposed Solution (by Aditya Waghamare)

### Analysis
Cross-platform contributors (especially between Windows and UNIX systems) encounter line-ending normalization issues (CRLF vs LF), resulting in noisy git diffs and accidental line ending modifications. Adding a standard `.gitattributes` file at the repository root ensures consistent `LF` line endings for text files across all operating systems and preserves binary assets correctly.

### Fix
Create a `.gitattributes` file at the repository root to normalize text files and mark images as binary.

### Implementation
```gitattributes
* text=auto eol=lf
*.jpeg binary
*.jpg binary
*.png binary
```

### Testing
Verify the repository correctly tracks text files with `eol=lf` line endings across Windows and Linux/macOS development environments using `git check-attr`.

Signed-off-by: Aditya Waghamare <adityawaghamare7620@gmail.com>

---
*Submitted by Aditya Waghamare*
💰 **Payout Address (Base L2 / EVM):** `0xb61dBcdBc3407F71EaCb64D4CBFAcf9FFfe2415C`