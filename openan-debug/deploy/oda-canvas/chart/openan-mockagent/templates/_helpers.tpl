{{/* OpenAN MockAgent chart helpers */}}
{{- define "openan-mockagent.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "openan-mockagent.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s" (default .Chart.Name .Values.nameOverride) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "openan-mockagent.labels" -}}
app.kubernetes.io/name: {{ include "openan-mockagent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
oda.tmforum.org/componentName: {{ .Release.Name }}
{{- end -}}

{{- define "openan-mockagent.serviceName" -}}
{{- include "openan-mockagent.fullname" . -}}-core
{{- end -}}

{{- define "openan-mockagent.publicBase" -}}
{{- if .Values.publicUrl -}}
{{- trimSuffix "/" .Values.publicUrl -}}
{{- else -}}
http://{{ include "openan-mockagent.serviceName" . }}:{{ .Values.service.port }}
{{- end -}}
{{- end -}}
