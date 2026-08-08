import Phaser from 'phaser';
import { TILE } from './types';
import type { Rect } from './types';
import { TileMap } from './physics';
const Matter = (Phaser as any).Physics.Matter.Matter;

const BOX_CATEGORY = 0x0001;
const PLAYER_CATEGORY = 0x0002;
const DEVICE_CATEGORY = 0x0004;
const SPRING_CATEGORY = 0x0008;
const PHASE_CATEGORY = 0x0010;
const GHOST_CATEGORY = 0x0020;

function rectKey(rect: Rect): string {
    return `${rect.x}:${rect.y}:${rect.w}:${rect.h}`;
}

export class CrateWorld {
    private readonly engine: any;
    private readonly tileBodies: any[] = [];
    private readonly deviceBodies = new Map<string, any>();
    private readonly springBodies = new Map<string, any>();
    private readonly phaseBodies = new Map<string, any>();
    private readonly boxBodies = new Map<number, any>();
    private readonly ghostBodies: any[] = [];
    private playerBody: any | null = null;
    private playerSupportId = -2;
    private playerSpringRect: Rect | null = null;
    private readonly tickMs = 1000 / 60;

    constructor(
        map: TileMap,
        devices: Rect[],
        springs: Rect[],
        matterWorld: Phaser.Physics.Matter.World,
    ) {
        if (!matterWorld) throw new Error('CrateWorld needs a Phaser Matter world');
        this.engine = matterWorld.engine;

        this.buildTileBodies(map);
        devices.forEach((device) => this.addDeviceBody(device));
        springs.forEach((spring) => this.addSpringBody(spring));
    }

    private createStaticBody(rect: Rect, options: any = {}): any {

        const body = Matter.Bodies.rectangle(
            rect.x + rect.w / 2,
            rect.y + rect.h / 2,
            rect.w,
            rect.h,
            {
                isStatic: true,
                friction: 0,
                frictionStatic: 1,
                frictionAir: 0,
                restitution: 0,
                ...options,
            },
        );
        Matter.Composite.add(this.engine.world, body);
        return body;
    }

    private buildTileBodies(map: TileMap): void {
        for (let row = 0; row < map.rows; row += 1) {
            let runStart = -1;
            for (let col = 0; col <= map.cols; col += 1) {
                const foundSolid = col < map.cols && map.isSolid(col, row);
                if (foundSolid) {
                    if (runStart < 0) runStart = col;
                } else if (runStart >= 0) {
                    const x = runStart * TILE;
                    const width = (col - runStart) * TILE;
                    this.tileBodies.push(
                        this.createStaticBody({
                            x,
                            y: row * TILE,
                            w: width,
                            h: TILE,
                        }, {
                            collisionFilter: {
                                category: 0xffff,
                                mask: BOX_CATEGORY | PLAYER_CATEGORY,
                            },
                        }),
                    );
                    runStart = -1;
                }
            }
        }
    }

    private addDeviceBody(rect: Rect): void {
        const key = rectKey(rect);
        const body = this.createStaticBody(rect, {
            collisionFilter: {
                category: DEVICE_CATEGORY,
                mask: BOX_CATEGORY,
            },
            isSensor: false,
        });
        this.deviceBodies.set(key, body);
    }

    private addSpringBody(rect: Rect): void {
        const key = rectKey(rect);
        const body = this.createStaticBody(rect, {
            collisionFilter: {
                category: SPRING_CATEGORY,
                mask: BOX_CATEGORY | PLAYER_CATEGORY,
            },
        });
        this.springBodies.set(key, body);
    }

    private createDynamicBody(rect: Rect, options: any = {}): any {
        const Matter = (Phaser as any).Physics.Matter.Matter;
        const body = Matter.Bodies.rectangle(
            rect.x + rect.w / 2,
            rect.y + rect.h / 2,
            rect.w,
            rect.h,
            {
                isStatic: false,
                friction: 0.8,
                frictionStatic: 1,
                frictionAir: 0,
                restitution: 0,
                slop: 0.001,
                ...options,
            },
        );
        Matter.Composite.add(this.engine.world, body);
        return body;
    }

    private ensurePlayerBody(rect: Rect): any {
        const Matter = (Phaser as any).Physics.Matter.Matter;
        if (!this.playerBody) {
            this.playerBody = this.createDynamicBody(rect, {
                collisionFilter: {
                    category: PLAYER_CATEGORY,
                    mask: BOX_CATEGORY | PHASE_CATEGORY | SPRING_CATEGORY,
                },
                plugin: { shapeKey: `${rect.w}:${rect.h}` },
            });
            Matter.Body.setInertia(this.playerBody, Infinity);
            return this.playerBody;
        }

        const current = this.playerBody;
        const currentShape = (current as any).plugin?.shapeKey;
        const desiredShape = `${rect.w}:${rect.h}`;
        if (currentShape !== desiredShape) {
            Matter.Composite.remove(this.engine.world, current);
            this.playerBody = this.createDynamicBody(rect, {
                collisionFilter: {
                    category: PLAYER_CATEGORY,
                    mask: BOX_CATEGORY | PHASE_CATEGORY | SPRING_CATEGORY,
                },
                plugin: { shapeKey: desiredShape },
            });
            Matter.Body.setInertia(this.playerBody, Infinity);
        }
        return this.playerBody;
    }

    setPlayerPose(rect: Rect, velocity: { x: number; y: number } = { x: 0, y: 0 }): void {
        const player = this.ensurePlayerBody(rect);
        Matter.Body.setPosition(player, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
        Matter.Body.setVelocity(player, velocity);
        Matter.Body.setAngle(player, 0);
        Matter.Body.setAngularVelocity(player, 0);
        this.syncPlayerState();
    }

    movePlayer(rect: Rect, velocity: { x: number; y: number }): { x: number; y: number } {
        this.setPlayerPose(rect, velocity);
        this.resolve();
        return this.readPlayer(rect.w, rect.h);
    }

    readPlayer(width: number, height: number): { x: number; y: number } {
        if (!this.playerBody) return { x: 0, y: 0 };
        return {
            x: this.playerBody.position.x - width / 2,
            y: this.playerBody.position.y - height / 2,
        };
    }

    setBox(id: number, rect: Rect, immovable: boolean): void {
        const existing = this.boxBodies.get(id);
        if (existing) Matter.Composite.remove(this.engine.world, existing);

        const body = this.createDynamicBody(rect, {
            isStatic: immovable,
            collisionFilter: {
                category: BOX_CATEGORY,
                mask: BOX_CATEGORY | DEVICE_CATEGORY | PHASE_CATEGORY | SPRING_CATEGORY | GHOST_CATEGORY,
            },
            plugin: { boxId: id },
        });
        this.boxBodies.set(id, body);
    }

    removeBox(id: number): void {
        const body = this.boxBodies.get(id);
        if (!body) return;
        Matter.Composite.remove(this.engine.world, body);
        this.boxBodies.delete(id);
    }

    setBoxState(
        id: number,
        x: number,
        y: number,
        w: number,
        h: number,
        vx: number,
        vy: number,
        angle: number,
        angularVelocity: number,
    ): void {
        const body = this.boxBodies.get(id);
        if (!body) return;

        Matter.Body.setPosition(body, { x: x + w / 2, y: y + h / 2 });
        Matter.Body.setVelocity(body, { x: vx, y: vy });
        Matter.Body.setAngle(body, angle);
        Matter.Body.setAngularVelocity(body, angularVelocity);
    }

    readBox(id: number, width: number, height: number): { x: number; y: number; vx: number; vy: number; a: number; av: number } {
        const body = this.boxBodies.get(id);
        if (!body) return { x: 0, y: 0, vx: 0, vy: 0, a: 0, av: 0 };
        return {
            x: body.position.x - width / 2,
            y: body.position.y - height / 2,
            vx: body.velocity.x,
            vy: body.velocity.y,
            a: body.angle,
            av: body.angularVelocity,
        };
    }

    applyGravity(id: number, vy: number): void {
        const body = this.boxBodies.get(id);
        if (!body || body.isStatic) return;
        Matter.Body.setVelocity(body, { x: body.velocity.x, y: vy });
    }

    shoveBox(id: number, dx: number): void {
        const body = this.boxBodies.get(id);
        if (!body || body.isStatic) return;
        Matter.Body.translate(body, { x: dx, y: 0 });
        Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
    }

    translateBox(id: number, dx: number, dy: number): void {
        const body = this.boxBodies.get(id);
        if (!body) return;
        Matter.Body.translate(body, { x: dx, y: dy });
    }

    setBoxStatic(id: number, isStatic: boolean): void {
        const body = this.boxBodies.get(id);
        if (!body) return;
        Matter.Body.setStatic(body, isStatic);
        if (isStatic) {
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(body, 0);
        }
    }

    setPhaseSolid(rect: Rect, active: boolean): void {
        const key = rectKey(rect);
        const existing = this.phaseBodies.get(key);
        if (active) {
            if (existing) return;
            const body = this.createStaticBody(rect, {
                collisionFilter: {
                    category: PHASE_CATEGORY,
                    mask: BOX_CATEGORY | PLAYER_CATEGORY,
                },
            });
            this.phaseBodies.set(key, body);
        } else if (existing) {
            Matter.Composite.remove(this.engine.world, existing);
            this.phaseBodies.delete(key);
        }
    }

    setGhosts(ghosts: Rect[]): void {
        this.ghostBodies.forEach((body) => Matter.Composite.remove(this.engine.world, body));
        this.ghostBodies.length = 0;
        ghosts.forEach((ghost) => {
            const body = this.createStaticBody(ghost, {
                collisionFilter: {
                    category: GHOST_CATEGORY,
                    mask: BOX_CATEGORY,
                },
            });
            this.ghostBodies.push(body);
        });
    }

    resolve(): void {
        Matter.Engine.update(this.engine, this.tickMs, 1);
        this.syncPlayerState();
    }

    step(): void {

        for (const body of this.boxBodies.values()) {
            if (body.isStatic) continue;
            const nextVy = Math.min(body.velocity.y + 1900 * (1 / 60), 900);
            Matter.Body.setVelocity(body, { x: body.velocity.x, y: nextVy });
        }
        this.resolve();
        for (const body of this.boxBodies.values()) {
            if (body.isStatic) continue;
            const speed = Math.hypot(body.velocity.x, body.velocity.y);
            if (speed < 0.02) Matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
    }

    bounceBox(id: number, vy: number): void {
        const body = this.boxBodies.get(id);
        if (!body || body.isStatic) return;
        Matter.Body.setVelocity(body, { x: body.velocity.x, y: vy });
    }

    get playerGroundedOn(): number {
        return this.playerSupportId;
    }

    get playerSpringRectContact(): Rect | null {
        return this.playerSpringRect;
    }

    private syncPlayerState(): void {
        this.playerSupportId = -2;
        this.playerSpringRect = null;
        if (!this.playerBody) return;

        const bodiesToCheck = [...this.boxBodies.values(), ...this.springBodies.values()];
        for (const other of bodiesToCheck) {
            if (Matter.Bounds.overlaps(this.playerBody.bounds, other.bounds)) {
                const collision = Matter.SAT.collides(this.playerBody, other);
                if (!collision.collided) continue;

                const plugin = (other as any).plugin as { boxId?: number } | undefined;
                if (plugin?.boxId !== undefined) {
                    this.playerSupportId = plugin.boxId;
                } else if (this.springBodies.has(rectKey(this.bodyToRect(other)))) {
                    this.playerSpringRect = this.bodyToRect(other);
                }
            }
        }
    }

    private bodyToRect(body: any): Rect {
        return {
            x: body.position.x - body.bounds.max.x + body.bounds.min.x + (body.bounds.max.x - body.bounds.min.x) / 2,
            y: body.position.y - body.bounds.max.y + body.bounds.min.y + (body.bounds.max.y - body.bounds.min.y) / 2,
            w: body.bounds.max.x - body.bounds.min.x,
            h: body.bounds.max.y - body.bounds.min.y,
        };
    }
}
