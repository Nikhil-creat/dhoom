FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080 DATA_DIR=/data UPLOAD_DIR=/data/uploads
VOLUME /data
EXPOSE 8080
CMD ["node","index.js"]
