
# Pipeline Examples

## GitHub Actions

```yaml
name: Production Deployment

on:
  push:
    branches: [main]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run dependency and image scan
        run: ./scripts/security-scan.sh

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: ./scripts/install.sh
      - name: Run tests
        run: ./scripts/test.sh

  build:
    runs-on: ubuntu-latest
    needs: [security-scan, test]
    steps:
      - uses: actions/checkout@v4
      - name: Build artifact
        run: ./scripts/build.sh
      - name: Publish image
        run: ./scripts/publish-image.sh

  deploy:
    runs-on: ubuntu-latest
    needs: [build]
    environment: production
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Blue-Green deploy
        run: |
          kubectl set image deployment/app app=registry.example.com/app:${{ github.sha }}
          kubectl rollout status deployment/app
          kubectl patch service app-service -p '{"spec":{"selector":{"version":"green"}}}'
      - name: Health check
        run: curl -fsS https://app.example.com/health
```

## GitLab CI

```yaml
stages:
  - build
  - test
  - security
  - deploy_staging
  - smoke
  - deploy_prod

variables:
  IMAGE_TAG: "$CI_COMMIT_SHORT_SHA"

build:
  stage: build
  script:
    - ./scripts/build.sh
    - ./scripts/publish-image.sh "$IMAGE_TAG"

test:
  stage: test
  script:
    - ./scripts/test.sh

security_scan:
  stage: security
  script:
    - ./scripts/security-scan.sh

deploy_staging:
  stage: deploy_staging
  script:
    - ./scripts/deploy.sh staging "$IMAGE_TAG"

smoke_test:
  stage: smoke
  script:
    - ./scripts/smoke-test.sh staging

deploy_prod:
  stage: deploy_prod
  when: manual
  script:
    - ./scripts/deploy.sh production "$IMAGE_TAG"
    - ./scripts/health-check.sh production
```

## Pattern Notes

- keep security scanning before production deploy
- promote the same artifact between environments
- prefer platform identity federation over static cloud keys
- keep deployment commands explicit enough to review and replay
