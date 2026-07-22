"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = require("../app");
const User_1 = require("../models/User");
const Branch_1 = require("../models/Branch");
const jwt_1 = require("../utils/jwt");
const jobs_1 = require("../jobs");
const enterprise_routes_1 = require("../modules/enterprise/enterprise.routes");
function signToken(user) {
    return (0, jwt_1.createAccessToken)(user, user.role, crypto_1.default.randomUUID());
}
async function runRequest(baseUrl, path, token, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers ?? {})
        }
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
}
function push(report, result) {
    report.results.push(result);
}
async function main() {
    const report = { results: [] };
    const app = await (0, app_1.createApp)();
    const server = http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 8081;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        const health = await fetch(`${baseUrl}/health`);
        push(report, {
            name: 'GET /health',
            status: health.status,
            ok: health.ok
        });
        for (const path of [
            '/api/courses/public/home',
            '/api/classes/public/home',
            '/api/notifications/public',
            '/api/auth/register/options'
        ]) {
            const result = await runRequest(baseUrl, path);
            push(report, {
                name: `GET ${path} public`,
                status: result.status,
                ok: result.status >= 200 && result.status < 300
            });
        }
        const suspiciousContact = await runRequest(baseUrl, '/api/messages/public-contact', undefined, {
            method: 'POST',
            body: JSON.stringify({
                name: '<script>alert(1)</script>',
                email: 'evil@nokta.test',
                subject: 'xss',
                message: '<img onerror=alert(1)>'
            })
        });
        push(report, {
            name: 'POST /api/messages/public-contact blocks suspicious input',
            status: suspiciousContact.status,
            ok: suspiciousContact.status === 400
        });
        const publicContactResult = await runRequest(baseUrl, '/api/messages/public-contact', undefined, {
            method: 'POST',
            body: JSON.stringify({
                name: 'Runtime Validator',
                email: 'validator@nokta.test',
                phone: '0202413316',
                subject: 'Smoke test',
                message: 'Public contact validation message'
            })
        });
        push(report, {
            name: 'POST /api/messages/public-contact',
            status: publicContactResult.status,
            ok: publicContactResult.status >= 200 && publicContactResult.status < 300
        });
        const roles = ['super_admin', 'admin', 'teacher', 'student', 'parent', 'branch_manager', 'owner'];
        const users = await Promise.all(roles.map(async (role) => [role, await User_1.User.findOne({ role, isDeleted: false }).lean()]));
        const tokenMap = new Map();
        for (const [role, user] of users) {
            if (user)
                tokenMap.set(role, signToken(user));
        }
        const superToken = tokenMap.get('super_admin');
        if (superToken) {
            for (const path of ['/api/exams', '/api/results', '/api/attendance', '/api/branches', '/api/users', '/api/books', '/api/messages/admin/summary']) {
                const result = await runRequest(baseUrl, path, superToken);
                push(report, {
                    name: `GET ${path} as super_admin`,
                    status: result.status,
                    ok: result.status >= 200 && result.status < 300
                });
            }
        }
        else {
            push(report, { name: 'super_admin_presence', status: null, ok: false, note: 'No super admin user in database' });
        }
        const studentToken = tokenMap.get('student');
        if (studentToken) {
            for (const [path, expected] of [
                ['/api/users', 403],
                ['/api/finance/summary', 403],
                ['/api/messages/admin/inbox', 403],
                ['/api/books', 200],
                ['/api/students/me/dashboard', 200]
            ]) {
                const result = await runRequest(baseUrl, path, studentToken);
                push(report, {
                    name: `GET ${path} as student`,
                    status: result.status,
                    ok: result.status === expected
                });
            }
            const aiMe = await runRequest(baseUrl, '/api/ai-results/me', studentToken);
            push(report, {
                name: 'GET /api/ai-results/me as student',
                status: aiMe.status,
                ok: aiMe.status >= 200 && aiMe.status < 300
            });
            const aiGenerateDenied = await runRequest(baseUrl, '/api/ai-results/generate/000000000000000000000001', studentToken, {
                method: 'POST'
            });
            push(report, {
                name: 'POST /api/ai-results/generate as student',
                status: aiGenerateDenied.status,
                ok: aiGenerateDenied.status === 403
            });
            const createBookResult = await runRequest(baseUrl, '/api/books', studentToken, {
                method: 'POST',
                body: JSON.stringify({
                    title: 'Unauthorized Student Book',
                    author: 'RBAC Smoke',
                    isbn: `student-denied-${Date.now()}`,
                    stockQuantity: 1,
                    price: 1
                })
            });
            push(report, {
                name: 'POST /api/books as student',
                status: createBookResult.status,
                ok: createBookResult.status === 403
            });
        }
        else {
            push(report, { name: 'student_presence', status: null, ok: false, note: 'No student user in database' });
        }
        const teacherToken = tokenMap.get('teacher');
        if (teacherToken) {
            const teacherFinance = await runRequest(baseUrl, '/api/finance/summary', teacherToken);
            push(report, {
                name: 'GET /api/finance/summary as teacher',
                status: teacherFinance.status,
                ok: teacherFinance.status === 403
            });
            const teacherList = await runRequest(baseUrl, '/api/teachers', teacherToken);
            push(report, {
                name: 'GET /api/teachers as teacher is forbidden',
                status: teacherList.status,
                ok: teacherList.status === 403
            });
        }
        const parentToken = tokenMap.get('parent');
        if (parentToken) {
            const parentUsers = await runRequest(baseUrl, '/api/users', parentToken);
            push(report, {
                name: 'GET /api/users as parent',
                status: parentUsers.status,
                ok: parentUsers.status === 403
            });
            const parentAiGenerate = await runRequest(baseUrl, '/api/ai-results/generate/000000000000000000000001', parentToken, {
                method: 'POST'
            });
            push(report, {
                name: 'POST /api/ai-results/generate as parent',
                status: parentAiGenerate.status,
                ok: parentAiGenerate.status === 403
            });
        }
        else {
            push(report, { name: 'parent_presence', status: null, ok: false, note: 'No parent user in database' });
        }
        const adminToken = tokenMap.get('admin');
        const ownerToken = tokenMap.get('owner');
        const branchToken = tokenMap.get('branch_manager');
        const branch = await Branch_1.Branch.findOne({ isDeleted: false }).select('_id').lean();
        const branchId = branch?._id?.toString?.() ?? '000000000000000000000001';
        if (adminToken && branchId) {
            const adminDeleteBranch = await runRequest(baseUrl, `/api/branches/${branchId}`, adminToken, { method: 'DELETE' });
            push(report, {
                name: 'DELETE /api/branches/:id as admin',
                status: adminDeleteBranch.status,
                ok: adminDeleteBranch.status === 403
            });
            const adminCreateBranch = await runRequest(baseUrl, '/api/branches', adminToken, {
                method: 'POST',
                body: JSON.stringify({
                    name: 'Unauthorized Admin Branch',
                    code: `ADM${Date.now()}`.slice(0, 12)
                })
            });
            push(report, {
                name: 'POST /api/branches as admin',
                status: adminCreateBranch.status,
                ok: adminCreateBranch.status === 403
            });
        }
        if (branchToken && branchId) {
            const managerDeleteBranch = await runRequest(baseUrl, `/api/branches/${branchId}`, branchToken, { method: 'DELETE' });
            push(report, {
                name: 'DELETE /api/branches/:id as branch_manager',
                status: managerDeleteBranch.status,
                ok: managerDeleteBranch.status === 403
            });
        }
        if (ownerToken && branchId) {
            const ownerApproveDelete = await runRequest(baseUrl, `/api/branches/${branchId}/approve-delete`, ownerToken, {
                method: 'POST'
            });
            push(report, {
                name: 'POST /api/branches/:id/approve-delete as owner',
                status: ownerApproveDelete.status,
                ok: ownerApproveDelete.status === 403
            });
        }
        if (superToken && branchId) {
            const superApproveDelete = await runRequest(baseUrl, `/api/branches/${branchId}/approve-delete`, superToken, {
                method: 'POST'
            });
            push(report, {
                name: 'POST /api/branches/:id/approve-delete as super_admin',
                status: superApproveDelete.status,
                ok: superApproveDelete.status >= 200 && superApproveDelete.status < 300
            });
        }
        if (branchToken && adminToken) {
            const [branchFinance, adminFinance] = await Promise.all([
                runRequest(baseUrl, '/api/finance/summary', branchToken),
                runRequest(baseUrl, '/api/finance/summary', adminToken)
            ]);
            push(report, {
                name: 'GET /api/finance/summary as branch_manager',
                status: branchFinance.status,
                ok: branchFinance.status >= 200 && branchFinance.status < 300
            });
            push(report, {
                name: 'GET /api/finance/summary as admin',
                status: adminFinance.status,
                ok: adminFinance.status >= 200 && adminFinance.status < 300
            });
        }
        const failed = report.results.filter((item) => !item.ok);
        console.log(JSON.stringify({ ok: failed.length === 0, failedCount: failed.length, results: report.results }, null, 2));
        if (failed.length) {
            process.exitCode = 1;
        }
    }
    catch (error) {
        console.error('API validation failed:', error);
        process.exitCode = 1;
    }
    finally {
        (0, jobs_1.stopAutomationJobs)();
        (0, enterprise_routes_1.stopEnterpriseJobs)();
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        await mongoose_1.default.disconnect();
    }
}
main();
