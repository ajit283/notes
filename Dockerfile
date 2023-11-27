# Stage 1: Build the application
FROM ocaml/opam:alpine-ocaml-5.0 as build

# Install system dependencies
RUN sudo apk add --update libev-dev openssl-dev libpcre3-dev libpq-dev

# Pull the latest OPAM repository updates
RUN cd ~/opam-repository && git pull origin master && opam update

WORKDIR /home/opam

# Copy the project's opam file and install dependencies
COPY --chown=opam:opam notes.opam notes.opam
RUN opam install . -y --deps-only

# Copy the rest of the application
COPY --chown=opam:opam . .

RUN eval $(opam env)


# Build the project
RUN opam exec -- dune build @install --profile=release

# Stage 2: Create the runtime image
FROM alpine:3.18 as run

# Install runtime dependencies
RUN apk add --update libev

# Copy the compiled binary from the build stage
COPY --from=build /home/opam/_build/default/bin/main.exe /bin/server

# Make sure the server is executable
RUN chmod +x /bin/server

ENTRYPOINT ["/bin/server"]