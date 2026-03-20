FROM postgres:18-alpine

RUN apk add --no-cache --virtual .build-deps git build-base clang llvm-dev \
    && git clone --branch v0.8.2 https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make clean && make OPTFLAGS="" && make install \
    && rm -rf /tmp/pgvector \
    && apk del .build-deps
