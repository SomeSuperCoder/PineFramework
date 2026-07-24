## Delta

No spec-level requirements changed. This change is purely an implementation fix
to how `fetchOlderOHLCV` gates scroll-back retries. All existing scroll-back
behavior (trigger at threshold, prepend, adjust viewport, re-execute indicators)
remains identical.
