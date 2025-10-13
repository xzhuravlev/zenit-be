import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module';
import { INestApplication } from '@nestjs/common';
import * as pactum from 'pactum';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { DatabaseService } from 'src/database/database.service';
import { SignInDto, SignUpDto } from 'src/auth/dto';

describe('App e2e', () => {
    let app: INestApplication;
    let db: DatabaseService;
    beforeAll(async () => {
        const moduleRef =
            await Test.createTestingModule({
                imports: [AppModule],
            }).compile();
        app = moduleRef.createNestApplication();
        app.enableCors({
            origin: 'http://localhost:3000',    // front address
            credentials: true,
        });
        app.use('/payments/stripe/webhook', bodyParser.raw({ type: '*/*' }));
        app.use(bodyParser.json());
        app.use(cookieParser());
        await app.init();
        await app.listen(3333);

        db = app.get(DatabaseService);
        await db.cleanDb();
        pactum.request.setBaseUrl('http://localhost:3333')
    });
    afterAll(() => {
        app.close();
    })

    describe('Auth', () => {
        describe('SignUp', () => {
            let access_token: string;
            const url: string = '/auth/registration';
            const dto: SignUpDto = {
                username: 'firstUser',
                email: 'user@mail.com',
                password: '123'
            };

            it('should throw if body is empty', () => {
                return pactum
                    .spec()
                    .post(url)
                    .expectStatus(400)
            })
            it('should throw if username is empty', () => {
                return pactum
                    .spec()
                    .post(url)
                    .withBody({
                        email: dto.email,
                        password: dto.password
                    })
                    .expectStatus(400)
            })
            it('should throw if email is empty', () => {
                return pactum
                    .spec()
                    .post(url)
                    .withBody({
                        username: dto.username,
                        password: dto.password
                    })
                    .expectStatus(400)
            })
            it('should throw if password is empty', () => {
                return pactum
                    .spec()
                    .post(url)
                    .withBody({
                        username: dto.username,
                        email: dto.email
                    })
                    .expectStatus(400)
            })
            it('should sign up', () => {
                return pactum
                    .spec()
                    .post(url)
                    .withBody(dto)
                    .expectStatus(201)
            })
        })

        describe('SignIn', () => {
            const url: string = '/auth/login'
            const dto: SignInDto = {
                email: 'user@mail.com',
                password: '123'
            }

            it('should throw if body is empty', () => {
                return pactum
                    .spec()
                    .post(url)
                    .expectStatus(400)
            })
            it('should throw if email is empty', () => {
                return pactum
                    .spec()
                    .post(url)
                    .withBody({
                        password: dto.password
                    })
                    .expectStatus(400)
            })
            it('should throw if password is empty', () => {
                return pactum
                    .spec()
                    .post(url)
                    .withBody({
                        email: dto.email
                    })
                    .expectStatus(400)
            })
            it('should sign in', () => {
                return pactum
                    .spec()
                    .post(url)
                    .withBody(dto)
                    .expectStatus(200)
                    .stores('userAccessToken', 'access_token')
            })
        })

        describe('Me', () => {
            const url: string = '/auth/me';

            it('should throw if headers are not provided', () => {
                return pactum
                    .spec()
                    .get(url)
                    .expectStatus(401);
            })

            it('should get authorized current user', () => {
                return pactum
                    .spec()
                    .get(url)
                    .withHeaders({
                        Authorization: 'Bearer $S{userAccessToken}'
                    })
                    .expectStatus(200);
            })
        })
    });

});