import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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

    function expectHasRefreshCookie(ctx: any) {
        const sc = ctx.res.headers['set-cookie'];
        if (!Array.isArray(sc)) {
            throw new Error('No set-cookie header array');
        }
        expect(sc.some((v: string) => v.startsWith('refresh_token='))).toBe(true);
    }

    describe('Auth', () => {
        describe('Registration', () => {
            const url: string = '/auth/registration';
            const dto: SignUpDto = {
                username: 'firstUser',
                email: 'user@mail.com',
                password: '123'
            };

            it('400 empty body', () => pactum.spec().post(url).expectStatus(400));
            it('400 no username', () => pactum.spec().post(url).withBody({ email: dto.email, password: dto.password }).expectStatus(400));
            it('400 no email', () => pactum.spec().post(url).withBody({ username: dto.username, password: dto.password }).expectStatus(400));
            it('400 no password', () => pactum.spec().post(url).withBody({ username: dto.username, email: dto.email }).expectStatus(400));
            it('201 creates user, sets refresh cookie, returns access_token', () => pactum.spec().post(url).withBody(dto).expectStatus(201).expectJsonLike({ access_token: /.+/ }).expect(expectHasRefreshCookie));
            it('403 duplicate email', () => pactum.spec().post(url).withBody({ username: 'another', email: 'user@mail.com', password: '123' }).expectStatus(403));
        })

        describe('Login', () => {
            const url = '/auth/login';
            const dto: SignInDto = { email: 'user@mail.com', password: '123' };

            it('400 empty body', () => pactum.spec().post(url).expectStatus(400));
            it('400 no email', () => pactum.spec().post(url).withBody({ password: '123' }).expectStatus(400));
            it('400 no password', () => pactum.spec().post(url).withBody({ email: dto.email }).expectStatus(400));
            it('403 wrong email', () => pactum.spec().post(url).withBody({ email: 'nope@mail.com', password: '123' }).expectStatus(403));
            it('403 wrong password', () => pactum.spec().post(url).withBody({ email: dto.email, password: 'wrong' }).expectStatus(403));
            it('200 ok, returns access_token & sets refresh cookie', () => pactum.spec().post('/auth/login').withBody(dto).expectStatus(200).expectJsonLike({ access_token: /.+/ }).expect(expectHasRefreshCookie).stores('accessToken', 'access_token').stores('refreshCookie', 'refreshCookieFromHeaders'));

        });

        describe('GET /auth/me', () => {
            const url = '/auth/me';

            it('401 without token', () => pactum.spec().get(url).expectStatus(401));
            it('200 with Bearer, returns user shape', () =>
                pactum
                    .spec()
                    .get(url)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expectJsonLike({
                        id: /\d+/,
                        email: 'user@mail.com',
                        username: 'firstUser',
                        role: /.+/,
                    }));
        });

        describe('Protected test routes', () => {
            it('GET /auth/profile => 200 for any JWT', () =>
                pactum.spec().get('/auth/profile').withHeaders({ Authorization: 'Bearer $S{accessToken}' }).expectStatus(200));

            it('GET /auth/admin => 403 for non-admin', () =>
                pactum.spec().get('/auth/admin').withHeaders({ Authorization: 'Bearer $S{accessToken}' }).expectStatus(403));

            it('GET /auth/moderator => 403 for non-moderator', () =>
                pactum
                    .spec()
                    .get('/auth/moderator')
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(403));
        });


    });

});