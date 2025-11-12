## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev
```

## Run tests

```bash
# unit tests
$ yarn test:unit

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn run test:cov
```

## Prepare for Demo

Before running the project, make sure that a `.env` file with the following contents is created in the project root:
``` .env
DATABASE_URL="postgresql://user:password@localhost:5434/nest?schema=public"
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=nest

JWT_SECRET="jwt_secret"
NODE_ENV=development        # development | production

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_REGION=...
AWS_S3_BUCKET_NAME=...
AWS_BUCKET_URL=...
```
Replace the variable values with those relevant to your environment. Make sure PostgreSQL and S3 (or emulator) are configured appropriately.

If you have Docker installed, just run:
`docker-compose up --build`

This will bring up:
- PostgreSQL on `localhost:5434`
- NestJS app on `http://localhost:3333`

After the first run, you need to apply migrations:
`yarn prisma migrate dev`
