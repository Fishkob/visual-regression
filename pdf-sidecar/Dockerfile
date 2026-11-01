FROM eclipse-temurin:25-jre-alpine AS agent
RUN wget -q -O /opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.29.0/opentelemetry-javaagent.jar

FROM maven:3-eclipse-temurin-27-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src/ src/
RUN mvn package -q -DskipTests

FROM eclipse-temurin:25-jre-alpine
RUN apk upgrade --no-cache
# The shade plugin keeps the pre-shade jar as target/original-*.jar, so a bare
# *.jar glob matches two files and fails the COPY on a cold build.
COPY --from=build /app/target/pdf-sidecar-*.jar /app.jar
COPY --from=agent /opentelemetry-javaagent.jar /opentelemetry-javaagent.jar
USER 1000:1000
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
ENTRYPOINT ["java", "-javaagent:/opentelemetry-javaagent.jar", "-XX:+UseZGC", "-XX:+ExitOnOutOfMemoryError", "-Xmx512m", "-jar", "/app.jar"]
