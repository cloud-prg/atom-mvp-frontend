ARG IMAGE_PLATFORM=linux/amd64

FROM --platform=${IMAGE_PLATFORM} node:22-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ARG VITE_DEMO_MODE=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM --platform=${IMAGE_PLATFORM} alpine:3.21
RUN apk add --no-cache nginx
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf
EXPOSE 8484
CMD ["nginx", "-g", "daemon off;"]
