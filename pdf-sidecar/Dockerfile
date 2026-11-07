FROM eclipse-temurin:25-jre-alpine@sha256:e1898fd6a11fc965a994d8ace186fd3585aeb636cf8f05f47a723fcfee0b0918 AS agent
# A GitHub release asset is replaceable, and this jar is `-javaagent:`-loaded
# into every sidecar: the digest is what ties the build to the artifact that was
# reviewed. Update it together with the version.
RUN wget -q -O /opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.29.0/opentelemetry-javaagent.jar \
  && echo "546531ca690a8603d2923b6db26bbda35c6409327b1e610430ae33c2f8f68050  /opentelemetry-javaagent.jar" | sha256sum -c -

# A bare `3-` is a floating major: the Maven that builds the shipped jar would
# change without a diff.
FROM maven:3.10.0-eclipse-temurin-27-alpine@sha256:da769f72b34d193553bdd6c2bc7706caad361afa2a28866f2aa8430e2c5e0f36 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src/ src/
RUN mvn package -q -DskipTests

FROM eclipse-temurin:25-jre-alpine@sha256:e1898fd6a11fc965a994d8ace186fd3585aeb636cf8f05f47a723fcfee0b0918
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
