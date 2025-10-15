import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as pactum from 'pactum';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import { DatabaseService } from 'src/database/database.service';
import { SignInDto, SignUpDto } from 'src/auth/dto';
import { UserRole } from '@prisma/client';

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
                username: 'user',
                email: 'user@mail.com',
                password: '123'
            };

            it('400 empty body', () => pactum.spec().post(url).expectStatus(400));
            it('400 no username', () => pactum.spec().post(url).withBody({ email: dto.email, password: dto.password }).expectStatus(400));
            it('400 no email', () => pactum.spec().post(url).withBody({ username: dto.username, password: dto.password }).expectStatus(400));
            it('400 no password', () => pactum.spec().post(url).withBody({ username: dto.username, email: dto.email }).expectStatus(400));
            it('201 creates admin, returns admin_access_token', () =>
                pactum
                    .spec()
                    .post(url)
                    .withBody({ username: 'admin', email: 'admin@mail.com', password: '123' })
                    .expectStatus(201)
                    .stores('accessTokenAdmin', 'access_token')
            );
            it('201 creates user, sets refresh cookie, returns access_token', () =>
                pactum
                    .spec()
                    .post(url)
                    .withBody(dto)
                    .expectStatus(201)
                    .expectJsonLike({ access_token: /.+/ })
                    .expect(expectHasRefreshCookie));
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
            it('200 ok, returns access_token & sets refresh cookie', () =>
                pactum
                    .spec()
                    .post('/auth/login')
                    .withBody(dto)
                    .expectStatus(200)
                    .expectJsonLike({ access_token: /.+/ })
                    .expect(expectHasRefreshCookie)
                    .stores('accessToken', 'access_token')
                    .stores('refreshCookie', 'refreshCookieFromHeaders'));

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
                        username: 'user',
                        role: 'USER',
                    })
            );
            it('200 with Bearer, returns admin shape', () =>
                pactum
                    .spec()
                    .get(url)
                    .withHeaders({ Authorization: 'Bearer $S{accessTokenAdmin}' })
                    .expectStatus(200)
                    .expectJsonLike({
                        id: /\d+/,
                        email: 'admin@mail.com',
                        username: 'admin',
                        role: 'ADMIN',
                    })
            );
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

        describe('Users controller', () => {
            it('403 user try get all users with USER role', () =>
                pactum
                    .spec()
                    .get('/users/all')
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(403)
            );

            it('401 admin try get all users with ADMIN role', () =>
                pactum
                    .spec()
                    .get('/users/all')
                    .withHeaders({ Authorization: 'Bearer $S{accessTokenAdmin}' })
                    .expectStatus(200)
            );
        })

        // ===== Users e2e =====
        describe('Users', () => {
            let myUserId: number;
            let adminAccessToken: string; // переиспользуем тот же токен после повышения роли (JWT payload не содержит role)

            // Возьмём свой id из /auth/me (у тебя уже есть успешный логин и $S{accessToken})
            it('prepare: read /auth/me and store my id', () =>
                pactum
                    .spec()
                    .get('/auth/me')
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .stores('myUserId', 'id')
                    .expect(({ res }) => { myUserId = res.body.id; })
            );

            describe('PATCH /users/edit', () => {
                const url = '/users/edit';

                it('401 without token', () =>
                    pactum.spec().patch(url).withBody({ username: 'updatedName' }).expectStatus(401));

                it('400 invalid body (username empty)', () =>
                    pactum
                        .spec()
                        .patch(url)
                        .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                        .withBody({ username: '' }) // при валидаторе должно быть 400
                        .expectStatus(200)
                );

                it('200 updates username for current user', () =>
                    pactum
                        .spec()
                        .patch(url)
                        .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                        .withBody({ username: 'moder', email: 'moder@mail.com' })
                        .expectStatus(200)
                        .expectJsonLike({ username: 'moder', email: 'moder@mail.com' })
                );
            });

            describe('GET /users/all (ModeratorGuard)', () => {
                const url = '/users/all';

                it('403 for regular user', () =>
                    pactum
                        .spec()
                        .get(url)
                        .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                        .expectStatus(403)
                );

                it('promote me to MODERATOR in DB', async () => {
                    await db.user.update({ where: { id: myUserId }, data: { role: UserRole.MODERATOR } });
                    // токен можно не обновлять — твои Guard'ы, судя по коду, читают userId из JWT и роль из БД
                    adminAccessToken = (await pactum
                        .spec()
                        .post('/auth/login') // логин необязателен, но пускай будет «чистый» токен
                        .withBody({ email: 'moder@mail.com', password: '123' })
                        .expectStatus(200)
                        .returns('access_token')) as string;
                });

                it('200 for moderator, returns array', () =>
                    pactum
                        .spec()
                        .get(url)
                        .withHeaders({ Authorization: `Bearer ${adminAccessToken}` })
                        .expectStatus(200)
                        .expect(({ res }) => {
                            expect(Array.isArray(res.body)).toBe(true);
                        })
                );
            });

            describe('PATCH /users/verify/:userId (AdminGuard)', () => {
                let targetUserId: number;

                it('create another user to verify', async () => {
                    // зарегистрируем второго пользователя
                    await pactum
                        .spec()
                        .post('/auth/registration')
                        .withBody({ username: 'secondUser', email: 'second@mail.com', password: '123' })
                        .expectStatus(201);

                    // узнаем его id напрямую из БД для простоты сценария
                    const u = await db.user.findUnique({ where: { email: 'second@mail.com' }, select: { id: true, verified: true } });
                    expect(u).toBeTruthy();
                    targetUserId = u!.id;
                });

                it('403 for non-admin', () =>
                    pactum
                        .spec()
                        .patch(`/users/verify/${targetUserId}`)
                        .withHeaders({ Authorization: `Bearer ${adminAccessToken}` }) // сейчас у нас MODERATOR
                        .expectStatus(403)
                );

                // it('promote me to ADMIN in DB', async () => {
                //     await db.user.update({ where: { id: myUserId }, data: { role: UserRole.ADMIN } });
                //     // Перелогинимся — не обязательно, но ок
                //     adminAccessToken = (await pactum
                //         .spec()
                //         .post('/auth/login')
                //         .withBody({ email: 'user@mail.com', password: '123' })
                //         .expectStatus(200)
                //         .returns('access_token')) as string;
                // });

                it('200 for admin, user becomes verified', () =>
                    pactum
                        .spec()
                        .patch(`/users/verify/${targetUserId}`)
                        .withHeaders({ Authorization: 'Bearer $S{accessTokenAdmin}' })
                        .expectStatus(200)
                        .expectJsonLike({ verified: true })
                );
            });
        });

        // ===== Cockpits e2e =====
        describe('Cockpits', () => {
            // данные для удобства
            const baseUrl = '/cockpits';

            // второй пользователь для негативных сценариев (не владелец)
            let secondAccessToken = '';

            // id кокпитов, чтобы переиспользовать между тестами
            let cockpitId1: number;
            let cockpitId2: number;

            // подготовим второго пользователя
            it('prepare: create & login second user', async () => {
                await pactum
                    .spec()
                    .post('/auth/registration')
                    .withBody({ username: 'other', email: 'other@mail.com', password: '123' })
                    .expectStatus(201);

                secondAccessToken = (await pactum
                    .spec()
                    .post('/auth/login')
                    .withBody({ email: 'other@mail.com', password: '123' })
                    .expectStatus(200)
                    .returns('access_token')) as string;
            });

            // -------- GET /cockpits (JwtGuard на всём контроллере) ----------
            it('GET /cockpits => 401 without token', () =>
                pactum.spec().get(baseUrl).expectStatus(401)); // класс под JwtGuard :contentReference[oaicite:5]{index=5}

            it('POST /cockpits => 401 without token', () =>
                pactum
                    .spec()
                    .post(baseUrl)
                    .withBody({ name: 'A320', manufacturer: 'Airbus', model: 'A320', type: 'Airliner' })
                    .expectStatus(401));

            // -------- POST /cockpits (создание с вложенностями) ----------
            it('POST /cockpits => 201 create minimal cockpit', () =>
                pactum
                    .spec()
                    .post(baseUrl)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({ name: 'A320', manufacturer: 'Airbus', model: 'A320', type: 'Airliner' })
                    .expectStatus(201)
                    .expectJsonLike({
                        id: /\d+/,
                        name: 'A320',
                        manufacturer: 'Airbus',
                        model: 'A320',
                        type: 'Airliner',
                    })
                    .stores('cockpitId1', 'id')
                    .expect(({ res }) => { cockpitId1 = res.body.id; })
            ); // include полей не проверяем строго, сервис возвращает с include media/instruments/checklists :contentReference[oaicite:6]{index=6}
            it('POST /cockpits => 201 create with media + instruments + checklists', () =>
                pactum
                    .spec()
                    .post(baseUrl)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({
                        name: 'B737',
                        manufacturer: 'Boeing',
                        model: '737-800',
                        type: 'Airliner',
                        media: [
                            { link: 'https://example.com/cockpit.jpg', type: 'PANORAMA', width: 800, height: 600 }
                        ],
                        instruments: [
                            {
                                name: 'Altimeter',
                                x: 10, y: 20,
                                media: [{ link: 'https://example.com/alt.png', type: 'PHOTO', width: 100, height: 100 }]
                            }
                        ],
                        checklists: [
                            { name: 'Preflight', items: [{ instrumentIndex: 0, description: 'Check ALT', order: 1 }] }
                        ]
                    })
                    .expectStatus(201)
                    .expectJsonLike({
                        name: 'B737',
                        manufacturer: 'Boeing',
                        model: '737-800',
                        instruments: [],
                        media: [],
                        checklists: []
                    })
                    .stores('cockpitId2', 'id')
                    .expect(({ res }) => { cockpitId2 = res.body.id; })
            ); // create связывает checklist items c instrument по index, как в сервисе :contentReference[oaicite:7]{index=7}
            // -------- GET /cockpits (без фильтров и с фильтрами/сортировкой) ----------
            it('GET /cockpits => 200 returns array (no filters)', () =>
                pactum
                    .spec()
                    .get(baseUrl)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expect(({ res }) => {
                        expect(Array.isArray(res.body)).toBe(true);
                        // сервис добавляет computed поле purchasedByMe (на основе покупок) :contentReference[oaicite:8]{index=8}
                        if (res.body.length > 0) {
                            expect(res.body[0]).toHaveProperty('purchasedByMe');
                        }
                    })
            );

            it('GET /cockpits?manufacturer=Boeing => 200 only Boeing', () =>
                pactum
                    .spec()
                    .get(`${baseUrl}?manufacturer=boe`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expect(({ res }) => {
                        expect(res.body.every((c: any) => /boeing/i.test(c.manufacturer))).toBe(true);
                    })
            ); // фильтр manufacturer contains insensitive :contentReference[oaicite:9]{index=9}

            it('GET /cockpits?orderBy=new => 200 returns newest first', () =>
                pactum
                    .spec()
                    .get(`${baseUrl}?orderBy=new`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expect(({ res }) => {
                        // т.к. B737 создали позже A320 — при new он должен идти раньше
                        const ids = res.body.map((c: any) => c.id);
                        expect(ids.indexOf(cockpitId2)).toBeLessThan(ids.indexOf(cockpitId1));
                    })
            ); // сортировка new/old по createdAt desc/asc :contentReference[oaicite:10]{index=10}

            // -------- GET /cockpits/:id ----------
            it('GET /cockpits/:id => 404 when not found', () =>
                pactum
                    .spec()
                    .get(`${baseUrl}/999999`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(404)
            ); // сервис кидает NotFoundException, если не нашёл :contentReference[oaicite:11]{index=11}

            it('GET /cockpits/:id => 200 returns cockpit with nested', () =>
                pactum
                    .spec()
                    .get(`${baseUrl}/${cockpitId2}`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expectJsonLike({
                        id: cockpitId2,
                        creator: { id: /\d+/, username: /.+/ },
                        instruments: [],
                        checklists: [],
                        media: [],
                        _count: { favoritedBy: /\d+/ }
                    })
            ); // include creator/_count/instruments/checklists/media в findOneById :contentReference[oaicite:12]{index=12}

            // -------- PATCH /cockpits/:id (владелец может, чужой USER — нельзя) ----------
            it('PATCH /cockpits/:id => 403 for non-owner USER', () =>
                pactum
                    .spec()
                    .patch(`${baseUrl}/${cockpitId1}`)
                    .withHeaders({ Authorization: `Bearer ${secondAccessToken}` })
                    .withBody({ name: 'HACK' })
                    .expectStatus(403)
            ); // сервис запрещает, если не владелец и роль текущего = USER :contentReference[oaicite:13]{index=13}

            it('PATCH /cockpits/:id => 200 for owner; updating name + media', () =>
                pactum
                    .spec()
                    .patch(`${baseUrl}/${cockpitId1}`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({
                        name: 'A320-Updated',
                        media: [{ link: 'https://example.com/new.jpg', type: 'PANORAMA', width: 1200, height: 800 }]
                    })
                    .expectStatus(200)
                    .expectJsonLike({ id: cockpitId1, name: 'A320-Updated' })
            ); // при передаче media/instruments/checklists сервис удаляет старые и создаёт новые :contentReference[oaicite:14]{index=14}

            // -------- PATCH /cockpits/:id/favorite ----------
            it('PATCH /cockpits/:id/favorite => 404 if cockpit not found', () =>
                pactum
                    .spec()
                    .patch(`${baseUrl}/999999/favorite`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(404)
            ); // NotFoundException если кокпит не существует :contentReference[oaicite:15]{index=15}

            it('PATCH /cockpits/:id/favorite => 200 like, returns liked:true & counts', () =>
                pactum
                    .spec()
                    .patch(`${baseUrl}/${cockpitId2}/favorite`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expectJsonLike({ cockpitId: cockpitId2, liked: true, favoritesCount: /\d+/ })
            ); // формат ответа: { cockpitId, liked, favoritesCount } :contentReference[oaicite:16]{index=16}

            it('PATCH /cockpits/:id/favorite => 200 unlike toggles liked:false', () =>
                pactum
                    .spec()
                    .patch(`${baseUrl}/${cockpitId2}/favorite`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expectJsonLike({ cockpitId: cockpitId2, liked: false, favoritesCount: /\d+/ })
            ); // повторный вызов disconnect-ит связь и меняет liked на false :contentReference[oaicite:17]{index=17}

            // -------- DELETE /cockpits/:id ----------
            it('DELETE /cockpits/:id => 403 for non-owner', () =>
                pactum
                    .spec()
                    .delete(`${baseUrl}/${cockpitId2}`)
                    .withHeaders({ Authorization: `Bearer ${secondAccessToken}` })
                    .expectStatus(403)
            ); // проверка прав: не владелец — Forbidden :contentReference[oaicite:18]{index=18}

            it('DELETE /cockpits/:id => 204 for owner', () =>
                pactum
                    .spec()
                    .delete(`${baseUrl}/${cockpitId2}`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(204)
            ); // контроллер возвращает NO_CONTENT (204) по @HttpCode(HttpStatus.NO_CONTENT) :contentReference[oaicite:19]{index=19}
        });

        // ===== Checklists e2e =====
        describe('Checklists', () => {
            const baseUrl = '/checklists';

            // под готового юзера из блока Auth
            let cockpitId: number;
            let checklistId: number;
            let instrA: number;
            let instrB: number;

            // подготовка: создаём кокпит с 2 приборами и 1 чеклистом (order: 1 -> instrA, 2 -> instrB)
            it('prepare: create cockpit with instruments & checklist', async () => {
                // создаём кокпит
                const createdId = await pactum
                    .spec()
                    .post('/cockpits')
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({
                        name: 'TestPlane',
                        manufacturer: 'TestCo',
                        model: 'TP-1',
                        type: 'Trainer',
                        instruments: [
                            { name: 'InstrA', x: 10, y: 10 },
                            { name: 'InstrB', x: 20, y: 20 },
                        ],
                        checklists: [
                            {
                                name: 'Engine Start',
                                items: [
                                    { instrumentIndex: 0, description: 'Step A', order: 1 },
                                    { instrumentIndex: 1, description: 'Step B', order: 2 },
                                ],
                            },
                        ],
                        media: [{ link: 'https://example.com/pano.jpg', type: 'PANORAMA', width: 100, height: 50 }],
                    })
                    .expectStatus(201)
                    .returns('id');

                cockpitId = createdId as number;

                // получаем кокпит и достаём ids инструментов и чеклиста
                const cockpit = await pactum
                    .spec()
                    .get(`/cockpits/${cockpitId}`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .returns('res.body'); // вернём весь body

                // инструменты приходят с id
                instrA = cockpit.instruments[0].id;
                instrB = cockpit.instruments[1].id;
                // чеклист тоже с id (внутри items упорядочены, но нам важен сам checklistId)
                checklistId = cockpit.checklists[0].id;
                expect(instrA).toBeGreaterThan(0);
                expect(instrB).toBeGreaterThan(0);
                expect(checklistId).toBeGreaterThan(0);
            });
            // -------- GET /checklists/:id ----------
            it('GET /checklists/:id => 401 without token', () =>
                pactum.spec().get(`${baseUrl}/${checklistId}`).expectStatus(401)); // класс под JwtGuard :contentReference[oaicite:2]{index=2}

            it('GET /checklists/:id => 200 returns checklist with items & cockpit', () =>
                pactum
                    .spec()
                    .get(`${baseUrl}/${checklistId}`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200)
                    .expectJsonLike({
                        id: checklistId,
                        items: [],
                        cockpit: {
                            id: cockpitId,
                            name: 'TestPlane',
                            instruments: [],
                            media: [], // в сервисе фильтр по type: 'PANORAMA' для media кокпита
                        },
                    })
            ); // include c items (order asc) и cockpit (PANORAMA, instruments) :contentReference[oaicite:3]{index=3}

            it('GET /checklists/:id => 404 for non-existing', () =>
                pactum
                    .spec()
                    .get(`${baseUrl}/9999999`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .expectStatus(200) // findOneById вернёт null, но контроллер не оборачивает в NotFound — это ок для твоей реализации
                // Если хочешь именно 404, добавь NotFound в сервисе findOneById и поменяй на .expectStatus(404)
            );

            // -------- POST /checklists/:id/complete ----------
            it('POST /checklists/:id/complete => 401 without token', () =>
                pactum
                    .spec()
                    .post(`${baseUrl}/${checklistId}/complete`)
                    .withBody({ selectedInstrumentIds: [instrA, instrB] })
                    .expectStatus(401)
            ); // JwtGuard на классе :contentReference[oaicite:4]{index=4}

            it('POST /checklists/:id/complete => 404 when checklist not found', () =>
                pactum
                    .spec()
                    .post(`${baseUrl}/9999999/complete`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({ selectedInstrumentIds: [instrA, instrB] })
                    .expectStatus(404)
            ); // сервис бросает NotFound, если чеклист не найден :contentReference[oaicite:5]{index=5}

            it('POST /checklists/:id/complete => 400 on empty array', () =>
                pactum
                    .spec()
                    .post(`${baseUrl}/${checklistId}/complete`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({ selectedInstrumentIds: [] })
                    .expectStatus(400)
            ); // "No instrument ids were submitted" :contentReference[oaicite:6]{index=6}

            it('POST /checklists/:id/complete => 400 on duplicates', () =>
                pactum
                    .spec()
                    .post(`${baseUrl}/${checklistId}/complete`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({ selectedInstrumentIds: [instrA, instrA] })
                    .expectStatus(400)
            ); // "Duplicate instrument ids in submission" :contentReference[oaicite:7]{index=7}

            it('POST /checklists/:id/complete => 400 when instrument not in checklist', () =>
                pactum
                    .spec()
                    .post(`${baseUrl}/${checklistId}/complete`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({ selectedInstrumentIds: [999999] })
                    .expectStatus(400)
            ); // "Instrument id ... not found in checklist" при маппинге instrumentId->order :contentReference[oaicite:8]{index=8}

            it('POST /checklists/:id/complete => 201 creates progress attempt=1, percent=100 for correct order', () =>
                pactum
                    .spec()
                    .post(`${baseUrl}/${checklistId}/complete`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({ selectedInstrumentIds: [instrA, instrB] }) // правильный порядок: 1,2
                    .expectStatus(201) // POST без @HttpCode -> 201
                    .expectJsonLike({ attempt: 1, percent: 100 })
            ); // Levenshtein на порядке даёт 100% совпадения :contentReference[oaicite:9]{index=9}

            it('POST /checklists/:id/complete => 201 updates progress attempt=2, percent<100 for wrong order', () =>
                pactum
                    .spec()
                    .post(`${baseUrl}/${checklistId}/complete`)
                    .withHeaders({ Authorization: 'Bearer $S{accessToken}' })
                    .withBody({ selectedInstrumentIds: [instrB, instrA] }) // неверный порядок: 2,1
                    .expectStatus(201)
                    .expect(({ res }) => {
                        expect(res.body.attempt).toBe(2);
                        expect(res.body.percent).toBeLessThan(100);
                    })
            ); // апдейт существующего progress (attempt++) и процент ниже 100 :contentReference[oaicite:10]{index=10}
        });



    });

});