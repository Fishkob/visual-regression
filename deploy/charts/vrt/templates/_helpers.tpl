{{- define "vrt.name" -}}
{{- default "vrt" .Values.namespace -}}
{{- end -}}

{{- define "vrt.labels" -}}
app.kubernetes.io/name: {{ include "vrt.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Scheme every browser-reachable URL is built from. `tls.enabled` is the chart's
own TLS, but TLS frequently ends in front of the ingress (external load
balancer, another proxy), so `scheme` overrides it explicitly.
*/}}
{{- define "vrt.scheme" -}}
{{- .Values.scheme | default (ternary "https" "http" .Values.tls.enabled) -}}
{{- end -}}

{{/*
Refuse to render with a placeholder credential. The tracked defaults used to
produce a working release whose object store answered to a password printed in
this repository; docker-compose already fails closed on an unset
POSTGRES_PASSWORD, and the chart now does the same.
*/}}
{{- define "vrt.validateSecrets" -}}
{{- $placeholders := list "" "CHANGE_ME" "changeme" "CHANGEME" -}}
{{- range $key := list "postgres_password" "rustfs_secret_key" -}}
{{- if has (toString (index $.Values.secrets $key)) $placeholders -}}
{{- fail (printf "secrets.%s is a placeholder — set it with --set or point the chart at your own Secret" $key) -}}
{{- end -}}
{{- end -}}
{{- end -}}
