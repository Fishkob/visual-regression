{{- define "vrt.name" -}}
{{- default "vrt" .Values.namespace -}}
{{- end -}}

{{- define "vrt.labels" -}}
app.kubernetes.io/name: {{ include "vrt.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
