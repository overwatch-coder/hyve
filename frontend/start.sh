#!/bin/sh
set -e

if [ -n "${DOMAIN}" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo "[hyve] SSL cert found for ${DOMAIN} — enabling HTTPS"
    # envsubst '${DOMAIN}' replaces only ${DOMAIN}, leaving nginx's own
    # $host, $uri, $scheme variables untouched.
    envsubst '${DOMAIN}' < /etc/nginx/nginx-https.conf.template \
        > /etc/nginx/conf.d/default.conf
else
    echo "[hyve] No SSL cert detected — running HTTP only"
fi

exec nginx -g "daemon off;"
