# Deploying an app

Every app builds once in Actions, pushes to GHCR, and tells Dokploy to redeploy. The reusable workflow `.github/workflows/image-release.yml` defines that flow.

## Flow

1. A release is cut (semantic-release on `main` or `staging`).
2. The workflow builds `ghcr.io/bloomfield-homes/<image>` tagged `<version>`, `sha-<short>` and `<channel>` (`production` or `staging`).
3. It calls `POST <base>/api/<compose|application>.deploy` with an `x-api-key` header on each target. Production deploys the Azure instance, then the on-prem standby. Staging deploys the Azure instance only.
4. On production, if `parity-url` is set, it polls up to 5 minutes until `parity-field` equals `parity-expect`.

A target is skipped with a notice when its ID, base URL or key is empty. A non-2xx response fails the job.

## Caller snippet

Add this job to the repo's release workflow, after the job named `release` that cuts the version:

```yaml
  image:
    needs: release
    if: needs.release.outputs.cut == 'true'
    permissions:
      contents: read
      packages: write
    uses: Bloomfield-Homes/.github/.github/workflows/image-release.yml@main
    with:
      vars: ${{ toJSON(vars) }}
      image: my-app
      sha: ${{ needs.release.outputs.sha }}
      version: ${{ needs.release.outputs.version }}
      channel: ${{ needs.release.outputs.channel }}
      app-type: compose # or application
      # build-args: |
      #   KEY=value
      # parity-url: https://example.com/status
      # parity-field: commit
      # parity-expect: ${{ needs.release.outputs.sha }}
    secrets: inherit
```

`vars` hands the caller's repo and org variables to the workflow, which lives in this repo and would not otherwise see them.

## Configuration

| Name | Kind | Scope |
|---|---|---|
| `DOKPLOY_AZURE_URL`, `DOKPLOY_ONPREM_URL` | variable | org |
| `DOKPLOY_AZURE_API_KEY`, `DOKPLOY_ONPREM_API_KEY` | secret | org |
| `DOKPLOY_PROD_ID`, `DOKPLOY_STANDBY_ID`, `DOKPLOY_STAGING_ID` | variable | repo |

Run the setup script from a checkout of this repo:

```bash
scripts/setup-dokploy-deploy <repo> --org   # first time, or to rotate keys
scripts/setup-dokploy-deploy <repo>         # onboard another repo
```

It grants the repo access to the org secrets and variables and writes the three repo IDs. Blank answers are skipped.

## One-time manual steps

In each Dokploy instance:

1. Create a `github-deploy` member limited to the app's project and generate its API key. That key goes into the matching org secret.
2. Add a GHCR registry using a PAT with `read:packages`.
3. Switch each app to the Docker image `ghcr.io/bloomfield-homes/<image>:production` or `:staging`.

## Rollback

Set the app's Docker image to an older `<version>` tag (for example `ghcr.io/bloomfield-homes/<image>:1.4.2`) and redeploy. Move it back to the channel tag when the fix ships.
