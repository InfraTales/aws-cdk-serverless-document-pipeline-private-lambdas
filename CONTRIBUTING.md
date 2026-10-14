# Contributing

Thanks for helping. Bug reports, fixes and doc changes are all welcome.
## Reporting a bug

Search the [issues](../../issues) first. If it's new, open one with:

- what you ran
- what you expected
- what happened, including the full error
## Sending a change

1. Fork the repo and create a branch from `main`.
2. Make the change. Add or update a test in `test/` if you touched code.
3. Run `npm run check`. It must pass, since CI runs the same command.
4. Open a pull request that explains what changed and why.

For anything bigger than a small fix, open an issue first so we can agree on the approach.
## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/), for example `fix(api): return 404 for other users' documents`. Common types are `feat`, `fix`, `docs`, `test` and `chore`.
## License

By contributing, you agree to license your work under the [InfraTales Open Source License](LICENSE).
