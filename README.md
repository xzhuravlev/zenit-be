# Zenit-BE
This project is the backend component of the Zenit project – a prototype platform for training pilots in small aircraft cockpits.

# Backend Launch
Install project dependencies:
```bash
$ yarn install
```
Make sure the `.env` file exists in the project root.

If it doesn't exist, create one with the following minimum requirements:
``` .env
DATABASE_URL="postgresql://user:password@localhost:5434/nest?schema=public"
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=nest

JWT_SECRET="jwt_secret"
NODE_ENV=development        # development | production

MEDIA_STORAGE=local         # local | s3
```

If you have Docker installed, just run:
```bash
$ docker compose up --build
```

This will bring up PostgreSQL DataBase on `localhost:5434`.

Before the first launch, you need to apply migrations:
```bash
$ yarn prisma migrate dev
```

Run the application in following mods:
```bash
# development
$ yarn start

# watch mode
$ yarn start:dev
```

NestJS backend app on `http://localhost:3333`

## Database
You can also open the interface for tracking data in the database while the program is running:
```bash
$ npx prisma studio
```

## Tests
Running program tests:
```bash
# unit tests
$ yarn test:unit

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn run test:cov
```