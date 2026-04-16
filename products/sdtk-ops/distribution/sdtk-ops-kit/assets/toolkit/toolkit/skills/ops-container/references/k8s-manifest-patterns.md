
# Kubernetes Manifest Patterns

## Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: app-api
  template:
    metadata:
      labels:
        app: app-api
    spec:
      containers:
        - name: api
          image: registry.example.com/app-api:1.2.3-abcd123
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 20
          startupProbe:
            httpGet:
              path: /health/startup
              port: 8080
            failureThreshold: 30
            periodSeconds: 5
          envFrom:
            - configMapRef:
                name: app-api-config
            - secretRef:
                name: app-api-secrets
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
```

## Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app-api
spec:
  type: ClusterIP
  selector:
    app: app-api
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

## ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-api-config
data:
  APP_ENV: production
  LOG_LEVEL: info
  FEATURE_FLAG_X: "false"
```

## PodDisruptionBudget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: app-api
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: app-api
```

## Pattern Notes

- keep resource limits and probes in the first deployable version
- route config and secrets through references, not inline literals
- match `maxUnavailable` and `minAvailable` so rollout and maintenance rules do not fight each other
