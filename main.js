const TelegramBot = require('node-telegram-bot-api');

// --- PENTING: GANTI TOKEN DAN ID OWNER INI ---
const token = 'YOUR_TELEGRAM_BOT_TOKEN'; 
const BOT_OWNER_ID = 123456789; // <<< GANTI DENGAN ID TELEGRAM ANDA

const bot = new TelegramBot(token, {polling: true}); 

// --- STRUKTUR DATA (Penyimpanan JSON In-Memory) ---
const groupSettings = {}; 
const premiumUsers = {}; // { userId: expiryTimestampInMs }
const knownChats = {}; 
const DEFAULT_ADMIN_ROLE = "Admin"; 
const DEFAULT_SETTINGS = {
    antiLink: false, antiMedia: false, antiSpam: false,
    blacklist: [], whitelist: [],
    rules: "Aturan belum ditetapkan. Gunakan /setrules [teks aturan] untuk mengatur.", 
};

console.log('Bot Ultimate Final V3 siap beraksi! 🚀');

// ----------------------------------------------------
// FUNGIONALITAS UTAMA (UTILITY & AUTH)
// ----------------------------------------------------

function getSettings(chatId) {
    if (!groupSettings[chatId]) {
        groupSettings[chatId] = { ...DEFAULT_SETTINGS };
    }
    return groupSettings[chatId];
}

async function isAdmin(chatId, userId) {
    try {
        const chatMember = await bot.getChatMember(chatId, userId);
        return chatMember.status === 'administrator' || chatMember.status === 'creator';
    } catch (e) {
        return false;
    }
}

function isPremium(userId) {
    if (userId === BOT_OWNER_ID) return true;
    const expiry = premiumUsers[userId];
    return expiry && expiry > Date.now();
}

// Utility untuk parsing durasi (contoh: 30D, 7W, 1Y)
function parseDuration(durationStr) {
    const match = durationStr.match(/^(\d+)([DWMY])$/i);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    let ms = 0;

    const DAY = 24 * 60 * 60 * 1000;
    switch (unit) {
        case 'D': ms = amount * DAY; break;
        case 'W': ms = amount * 7 * DAY; break;
        case 'M': ms = amount * 30 * DAY; break; // Perkiraan 30 hari
        case 'Y': ms = amount * 365 * DAY; break; // Perkiraan 365 hari
    }
    return ms;
}

// Handler untuk menyimpan/memperbarui daftar chat
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type.includes('group')) {
        knownChats[chatId] = msg.chat.title || 'Unknown Group';
    }
});
// Handler untuk menghapus chat jika bot keluar
bot.on('left_chat_member', (msg) => {
    if (msg.left_chat_member && msg.left_chat_member.id === bot.options.id) {
        delete knownChats[msg.chat.id];
    }
});


// ----------------------------------------------------
// 3. FITUR PREMIUM (ADD PREMIUM & BROADCAST)
// ----------------------------------------------------

// OWNER ONLY: Add Premium
bot.onText(/\/addpremium (\d+) (\S+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const targetId = parseInt(match[1]);
    const durationStr = match[2];

    if (msg.from.id !== BOT_OWNER_ID) {
        return bot.sendMessage(chatId, '❌ Perintah ini *khusus Owner Bot*.');
    }

    const durationMs = parseDuration(durationStr);
    if (!durationMs) {
        return bot.sendMessage(chatId, '⚠️ Format durasi salah. Contoh: 30D (Hari), 7W (Minggu), 1Y (Tahun).');
    }

    const expiryTime = Date.now() + durationMs;
    premiumUsers[targetId] = expiryTime;
    
    const expiryDate = new Date(expiryTime).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });

    bot.sendMessage(chatId, `✅ User ID \`${targetId}\` berhasil ditambahkan ke Premium!
    *Kedaluwarsa:* ${expiryDate}`, { parse_mode: 'Markdown' });
});

// PREMIUM ONLY: Broadcast/BC
bot.onText(/\/bc (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const broadcastMessage = match[1];

    if (!isPremium(msg.from.id)) {
        return bot.sendMessage(chatId, '❌ Fitur Broadcast *khusus pengguna Premium* atau Owner Bot.');
    }

    const chatIds = Object.keys(knownChats);
    let successCount = 0;
    
    await bot.sendMessage(chatId, `📢 Mulai Broadcast ke ${chatIds.length} grup...`, { reply_to_message_id: msg.message_id });

    for (const targetChatId of chatIds) {
        try {
            await bot.sendMessage(targetChatId, `📣 *Pesan Broadcast:*\n\n${broadcastMessage}`, { parse_mode: 'Markdown' });
            successCount++;
        } catch (e) {
            // Biasanya error jika bot diblokir atau dikeluarkan
            console.error(`Gagal BC ke ${knownChats[targetChatId]} (${targetChatId}): ${e.message}`);
        }
    }

    bot.sendMessage(chatId, `✅ Broadcast selesai. Berhasil terkirim ke *${successCount}* grup.`, { parse_mode: 'Markdown' });
});


// ----------------------------------------------------
// 4. MENU UTAMA & FITUR GRUP
// ----------------------------------------------------

// Menu Utama
bot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    const isOwner = msg.from.id === BOT_OWNER_ID;
    
    let menu = `
*--- 🤖 Menu Utama Group Assistant ---*

*🛠️ Command Mod (Admin & Reply):*
/promote [role] - Promosi jadi Admin (default: Admin).
/demote - Hapus status Admin.
/kick | /ban | /unban
/blacklist | /whitelist | /delist

*⚙️ Pengaturan Anti-Filter (Admin):*
/antilink [on/off] | /antimedia [on/off] | /antispam [on/off]

*ℹ️ Command Group:*
/tagall - Mention Admin grup (*Admin Only*).
/rules - Tampilkan aturan grup.
/setrules [teks] - Atur/Ubah aturan grup (*Admin Only*).
/info - Tampilkan info dan status grup.
/status - Tampilkan status filter ON/OFF.
/cekid - Tampilkan ID User/Chat.
`;

    if (isPremium(msg.from.id)) {
        menu += `\n*💎 Fitur Premium:*
/bc [pesan] - Kirim pesan ke semua grup.
`;
    }

    if (isOwner) {
        menu += `\n*👑 Perintah Owner:*
/addpremium [id] [durasi] - Beri status Premium (cth: 30D, 1Y).
/listchat - Daftar semua grup.
`;
    }

    bot.sendMessage(chatId, menu, { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
});

// TAGALL (Mention Admin)
bot.onText(/\/tagall/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (!msg.chat.type.includes('group')) return;

    if (!await isAdmin(chatId, msg.from.id)) {
        return bot.sendMessage(chatId, '❌ Gagal: Hanya Admin yang dapat menggunakan /tagall.', { reply_to_message_id: msg.message_id });
    }

    try {
        const admins = await bot.getChatAdministrators(chatId);
        let mentionList = "";
        
        for (const admin of admins) {
            if (admin.user.is_bot) continue;
            
            const name = admin.user.first_name || "Admin";
            mentionList += `[${name}](tg://user?id=${admin.user.id}) `;
        }

        bot.sendMessage(chatId, `🔔 *Pemberitahuan kepada Semua Admin:*\n\n${mentionList}\n\nAda pesan penting!`, {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id
        });

    } catch (e) {
        bot.sendMessage(chatId, '⚠️ Gagal me-mention. Pastikan bot memiliki hak Admin.');
    }
});


// ----------------------------------------------------
// 5. MODERASI LENGKAP & FILTERS (Logika sama seperti sebelumnya)
// ----------------------------------------------------

const MODERATION_COMMANDS = [
    'ban', 'unban', 'kick', 'promote', 'demote', 'blacklist', 'whitelist', 'delist'
];

bot.onText(new RegExp(`\/(ban|unban|kick|promote|demote|blacklist|whitelist|delist)(.*)`), async (msg, match) => {
    const chatId = msg.chat.id;
    const command = match[1];
    const args = match[2] ? match[2].trim() : '';
    const senderId = msg.from.id;
    const repliedMsg = msg.reply_to_message;
    
    if (!await isAdmin(chatId, senderId)) {
        return bot.sendMessage(chatId, '❌ Gagal: Hanya *Admin* yang dapat menggunakan perintah moderasi.', { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' });
    }

    if (!repliedMsg) {
        return bot.sendMessage(chatId, `Gagal: Gunakan /${command} dengan **membalas** pesan pengguna target.`, { reply_to_message_id: msg.message_id });
    }

    const targetId = repliedMsg.from.id;
    const targetName = repliedMsg.from.first_name;
    const settings = getSettings(chatId);

    // [Logika Ban/Kick/Unban/Promote/Demote/Daftar di sini]
    if (command === 'ban' || command === 'kick') {
        try {
            const banUntil = (command === 'kick') ? Math.floor(Date.now() / 1000) + 60 : 0; 
            await bot.banChatMember(chatId, targetId, { until_date: banUntil });
            if (command === 'kick') { await bot.unbanChatMember(chatId, targetId); bot.sendMessage(chatId, `✅ ${targetName} telah **dikeluarkan** (Kick).`); } 
            else { bot.sendMessage(chatId, `🚫 ${targetName} telah **diblokir** (Ban).`); }
        } catch (e) { bot.sendMessage(chatId, `⚠️ Gagal ${command}.`); }
    } else if (command === 'unban') {
        try {
            await bot.unbanChatMember(chatId, targetId); bot.sendMessage(chatId, `✅ ${targetName} telah **diizinkan kembali** (Unban).`);
        } catch (e) { bot.sendMessage(chatId, `⚠️ Gagal Unban.`); }
    } else if (command === 'promote') {
        const customRole = args || DEFAULT_ADMIN_ROLE;
        const options = { can_delete_messages: true, can_invite_users: true, can_pin_messages: true, can_restrict_members: true, can_promote_members: false, is_anonymous: false, custom_title: customRole }; 
        try {
            await bot.promoteChatMember(chatId, targetId, options); 
            bot.sendMessage(chatId, `✅ ${targetName} dipromosikan! *Role:* ${customRole}`, { parse_mode: 'Markdown' });
        } catch (e) { bot.sendMessage(chatId, `⚠️ Gagal Promote.`); }
    } else if (command === 'demote') {
        const options = { can_delete_messages: false, can_invite_users: false, can_pin_messages: false, can_restrict_members: false, can_promote_members: false, custom_title: '' };
        try {
            await bot.promoteChatMember(chatId, targetId, options); 
            bot.sendMessage(chatId, `✅ ${targetName} telah **didemote**.`);
        } catch (e) { bot.sendMessage(chatId, `⚠️ Gagal Demote.`); }
    } else if (command === 'blacklist') {
        if (!settings.blacklist.includes(targetId)) {
            settings.blacklist.push(targetId);
            settings.whitelist = settings.whitelist.filter(id => id !== targetId); 
            bot.sendMessage(chatId, `🚫 ${targetName} telah ditambahkan ke **Blacklist**.`);
        } else { bot.sendMessage(chatId, `⚠️ ${targetName} sudah ada dalam Blacklist.`); }
    } else if (command === 'whitelist') {
        if (!settings.whitelist.includes(targetId)) {
            settings.whitelist.push(targetId);
            settings.blacklist = settings.blacklist.filter(id => id !== targetId); 
            bot.sendMessage(chatId, `✨ ${targetName} telah ditambahkan ke **Whitelist**.`);
        } else { bot.sendMessage(chatId, `⚠️ ${targetName} sudah ada dalam Whitelist.`); }
    } else if (command === 'delist') {
        const wasBlacklisted = settings.blacklist.includes(targetId);
        const wasWhitelisted = settings.whitelist.includes(targetId);
        settings.blacklist = settings.blacklist.filter(id => id !== targetId);
        settings.whitelist = settings.whitelist.filter(id => id !== targetId);
        if (wasBlacklisted || wasWhitelisted) { bot.sendMessage(chatId, `🗑️ ${targetName} telah **dihapus** dari daftar.`); } 
        else { bot.sendMessage(chatId, `⚠️ ${targetName} tidak ada dalam daftar manapun.`); }
    }
});


// ----------------------------------------------------
// 6. LOGIKA FILTER & UTILITAS LAIN
// ----------------------------------------------------

// LOGIKA ANTI-FILTER ON/OFF
bot.onText(new RegExp(`\/(antilink|antimedia|antispam)\s(on|off)`, 'i'), async (msg, match) => {
    const chatId = msg.chat.id;
    const feature = match[1].toLowerCase();
    const action = match[2].toLowerCase();
    
    if (!await isAdmin(chatId, msg.from.id)) { return bot.sendMessage(chatId, '❌ Gagal: Hanya *Admin* yang dapat mengubah pengaturan anti-filter.', { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }); }

    const settings = getSettings(chatId);
    const status = (action === 'on');

    if (settings.hasOwnProperty(feature)) {
        settings[feature] = status;
        bot.sendMessage(chatId, `✅ Fitur **${feature.toUpperCase()}** berhasil diatur ke **${action.toUpperCase()}**.`);
    } else { bot.sendMessage(chatId, '⚠️ Fitur tidak dikenal.'); }
});

// LOGIKA PEMROSESAN PESAN (Test, Blacklist, Anti-Filter)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const settings = getSettings(chatId);
    const userId = msg.from.id;

    if (msg.text && msg.text.toLowerCase().trim() === 'test' && !msg.chat.type.includes('channel')) { bot.sendMessage(chatId, '✅ Bot ON. Siap melayani!', { reply_to_message_id: msg.message_id }); return; }

    if (await isAdmin(chatId, userId) || settings.whitelist.includes(userId)) return;

    // A. Blacklist
    if (settings.blacklist.includes(userId)) { try { await bot.deleteMessage(chatId, msg.message_id); return; } catch (e) { } }

    // B. ANTI-LINK
    if (settings.antiLink && msg.text && (/(http|https|www\.)\S+/i.test(msg.text) || msg.entities?.some(e => e.type === 'url' || e.type === 'text_link'))) {
        try { await bot.deleteMessage(chatId, msg.message_id); bot.sendMessage(chatId, `🚫 Link dilarang!`, { reply_to_message_id: msg.message_id }); return; } catch (e) { }
    }

    // C. ANTI-MEDIA
    if (settings.antiMedia && (msg.photo || msg.video || msg.document || msg.audio || msg.voice)) {
        try { await bot.deleteMessage(chatId, msg.message_id); bot.sendMessage(chatId, `🖼️ Media dilarang!`, { reply_to_message_id: msg.message_id }); return; } catch (e) { }
    }

    // D. ANTI-SPAM Sederhana
    if (settings.antiSpam && msg.text && msg.text.length < 5) {
        try { await bot.deleteMessage(chatId, msg.message_id); return; } catch (e) { }
    }
});

// LOGIKA RULES & SETRULES
bot.onText(/\/rules/, (msg) => {
    const chatId = msg.chat.id;
    const settings = getSettings(chatId);
    bot.sendMessage(chatId, `📜 *Aturan Grup ${msg.chat.title || 'Ini'}*\n\n${settings.rules}`, { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
});

bot.onText(/\/setrules (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const newRules = match[1];
    if (!await isAdmin(chatId, msg.from.id)) { return bot.sendMessage(chatId, '❌ Gagal: Hanya *Admin* yang dapat mengatur aturan.', { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }); }
    const settings = getSettings(chatId);
    settings.rules = newRules;
    bot.sendMessage(chatId, '✅ Aturan grup berhasil disimpan dan diperbarui!', { reply_to_message_id: msg.message_id });
});

// LOGIKA UTILITY INFO, CEKID, STATUS, LISTCHAT
bot.onText(/\/cekid/, (msg) => {
    const chatId = msg.chat.id;
    let targetMsg = msg.reply_to_message || msg;
    const userId = targetMsg.from.id;
    const userName = targetMsg.from.username ? `@${targetMsg.from.username}` : targetMsg.from.first_name;
    const info = `*--- Informasi ID Pengguna ---*\n👤 *Nama:* ${userName}\n🆔 *User ID:* \`${userId}\`\n*ID Chat saat ini:* \`${chatId}\``;
    bot.sendMessage(chatId, info, { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
});

bot.onText(/\/listchat/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private' || msg.from.id !== BOT_OWNER_ID) { return bot.sendMessage(chatId, '❌ Perintah ini hanya dapat digunakan oleh pemilik bot di private chat.'); }
    let list = '🌐 *Daftar Grup yang Dikelola Bot:*\n\n';
    if (Object.keys(knownChats).length === 0) { list += 'Tidak ada grup yang terdeteksi saat ini.'; } 
    else { for (const id in knownChats) { list += `• *${knownChats[id]}*\n  \`ID: ${id}\`\n`; } }
    bot.sendMessage(chatId, list, { parse_mode: 'Markdown' });
});

bot.onText(/\/info/, async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.chat.type.includes('group')) { return bot.sendMessage(chatId, '❌ Perintah ini hanya berlaku di Grup atau Supergroup.'); }
    const chat = await bot.getChat(chatId);
    const settings = getSettings(chatId);
    const info = `*--- Informasi Grup ---*\n🏷️ *Nama Grup:* ${chat.title}\n🆔 *ID Grup:* \`${chatId}\`\n👥 *Jumlah Anggota:* ${chat.members_count || 'N/A'}\n*Aturan:* ${settings.rules === DEFAULT_SETTINGS.rules ? 'Belum Ditetapkan' : 'Sudah Ditetapkan'}`;
    bot.sendMessage(chatId, info, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const settings = getSettings(chatId);
    const statusMessage = `*--- Status Fitur Moderasi Grup ---*\n*Anti-Link:* ${settings.antiLink ? '✅ ON' : '❌ OFF'}\n*Anti-Media:* ${settings.antiMedia ? '✅ ON' : '❌ OFF'}\n*Anti-Spam (Sederhana):* ${settings.antiSpam ? '✅ ON' : '❌ OFF'}\n\n*Blacklist:* ${settings.blacklist.length} pengguna\n*Whitelist:* ${settings.whitelist.length} pengguna`;
    bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
});
