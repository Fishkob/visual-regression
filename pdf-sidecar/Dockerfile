FROM eclipse-temurin:25-jre-alpine@sha256:e1898fd6a11fc965a994d8ace186fd3585aeb636cf8f05f47a723fcfee0b0918 AS agent
# A GitHub release asset is replaceable, and this jar is `-javaagent:`-loaded
# into every sidecar: the digest is what ties the build to the artifact that was
# reviewed. Update it together with the version.
#
# The download is retried because GitHub's release CDN answers 5xx during its
# own incidents, and one attempt turns every e2e job into a red build for a
# reason that has nothing to do with this repository. The digest still decides
# whether the bytes are the reviewed artifact — a retry cannot substitute for it.
RUN set -eux; \
  url=https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.29.0/opentelemetry-javaagent.jar; \
  for attempt in 1 2 3 4 5; do \
    if wget -q -T 60 -O /opentelemetry-javaagent.jar "$url"; then break; fi; \
    if [ "$attempt" = 5 ]; then exit 1; fi; \
    echo "download attempt $attempt failed, retrying"; \
    rm -f /opentelemetry-javaagent.jar; \
    sleep $((attempt * 5)); \
  done; \
  echo "546531ca690a8603d2923b6db26bbda35c6409327b1e610430ae33c2f8f68050  /opentelemetry-javaagent.jar" | sha256sum -c -

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
