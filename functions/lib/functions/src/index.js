"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToLibrary = exports.proxyGeminiAnalysis = exports.onVideoUploaded = exports.getUploadUrl = exports.getSignedUrl = exports.onUserCreate = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// Auth triggers
var onUserCreate_1 = require("./auth/onUserCreate");
Object.defineProperty(exports, "onUserCreate", { enumerable: true, get: function () { return onUserCreate_1.onUserCreate; } });
// Storage functions (Phase 3)
var getSignedUrl_1 = require("./storage/getSignedUrl");
Object.defineProperty(exports, "getSignedUrl", { enumerable: true, get: function () { return getSignedUrl_1.getSignedUrl; } });
var getUploadUrl_1 = require("./storage/getUploadUrl");
Object.defineProperty(exports, "getUploadUrl", { enumerable: true, get: function () { return getUploadUrl_1.getUploadUrl; } });
var onVideoUploaded_1 = require("./storage/onVideoUploaded");
Object.defineProperty(exports, "onVideoUploaded", { enumerable: true, get: function () { return onVideoUploaded_1.onVideoUploaded; } });
// AI proxy (Phase 4)
var proxyGeminiAnalysis_1 = require("./ai/proxyGeminiAnalysis");
Object.defineProperty(exports, "proxyGeminiAnalysis", { enumerable: true, get: function () { return proxyGeminiAnalysis_1.proxyGeminiAnalysis; } });
// Library management (Phase 5)
var addToLibrary_1 = require("./library/addToLibrary");
Object.defineProperty(exports, "addToLibrary", { enumerable: true, get: function () { return addToLibrary_1.addToLibrary; } });
//# sourceMappingURL=index.js.map