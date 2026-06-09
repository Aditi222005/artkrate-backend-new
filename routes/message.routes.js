const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../middlewares/verifyToken');
const Message = require('../models/message.model');
const User = require('../models/user.model');
const { getCache, setCache, delCache } = require('../utils/redisClient');

// Helper to generate a consistent sorted cache key for messaging history
const getHistoryKey = (id1, id2) => {
  const sortedIds = [id1.toString(), id2.toString()].sort();
  return `chat:history:${sortedIds[0]}:${sortedIds[1]}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages - Send a message
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  try {
    const { receiverId, content, artworkId } = req.body;
    const senderId = req.user.id;

    if (!receiverId || !content) {
      return res.status(400).json({ message: "Receiver ID and message content are required." });
    }

    if (senderId === receiverId) {
      return res.status(400).json({ message: "You cannot message yourself." });
    }

    // Verify receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    const messageData = {
      senderId,
      receiverId,
      content: content.trim(),
    };

    if (artworkId) {
      messageData.artworkId = artworkId;
    }

    const message = new Message(messageData);
    await message.save();

    // Populate sender info for immediate frontend display
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'name profilePhoto email')
      .populate('receiverId', 'name profilePhoto email')
      .populate('artworkId', 'title images price');

    // Invalidate Redis caches immediately for both users
    const historyKey = getHistoryKey(senderId, receiverId);
    await Promise.all([
      delCache(`chat:conversations:${senderId}`),
      delCache(`chat:conversations:${receiverId}`),
      delCache(historyKey)
    ]);

    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error('[Messages] Send error:', err.message);
    res.status(500).json({ message: 'Server error while sending message.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/conversations - Get all conversations for active user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `chat:conversations:${userId}`;

    // Try fetching from Redis Cache first
    const cachedConversations = await getCache(cacheKey);
    if (cachedConversations) {
      return res.status(200).json(cachedConversations);
    }

    // If cache miss, fetch from MongoDB
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messages = await Message.find({
      $or: [{ senderId: userObjectId }, { receiverId: userObjectId }]
    })
      .sort({ createdAt: -1 })
      .populate('senderId', 'name profilePhoto email userType')
      .populate('receiverId', 'name profilePhoto email userType')
      .populate('artworkId', 'title images price');

    const conversationMap = {};
    messages.forEach(msg => {
      const otherUser = msg.senderId._id.toString() === userId ? msg.receiverId : msg.senderId;
      if (!otherUser) return;
      const otherUserId = otherUser._id.toString();

      if (!conversationMap[otherUserId]) {
        conversationMap[otherUserId] = {
          otherUser,
          lastMessage: msg,
          unreadCount: (msg.read === false && msg.receiverId._id.toString() === userId) ? 1 : 0
        };
      } else {
        if (msg.read === false && msg.receiverId._id.toString() === userId) {
          conversationMap[otherUserId].unreadCount += 1;
        }
      }
    });

    const conversations = Object.values(conversationMap);

    // Save to Redis cache (expires in 30 seconds for quick polling balance)
    await setCache(cacheKey, conversations, 30);

    res.status(200).json(conversations);
  } catch (err) {
    console.error('[Messages] Conversations list error:', err.message);
    res.status(500).json({ message: 'Server error while loading conversations.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/:otherUserId - Get chat history with a specific user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:otherUserId', verifyToken, async (req, res) => {
  try {
    const activeUserId = req.user.id;
    const otherUserId = req.params.otherUserId;
    const historyKey = getHistoryKey(activeUserId, otherUserId);

    // Try fetching history from Redis Cache first
    const cachedHistory = await getCache(historyKey);
    if (cachedHistory) {
      // Async: Update read status in background database
      Message.updateMany(
        { senderId: new mongoose.Types.ObjectId(otherUserId), receiverId: new mongoose.Types.ObjectId(activeUserId), read: false },
        { $set: { read: true } }
      ).then((res) => {
        if (res.modifiedCount > 0) {
          delCache(`chat:conversations:${activeUserId}`);
        }
      }).catch(err => console.error('[Messages] Async read update failed:', err));

      return res.status(200).json(cachedHistory);
    }

    // If cache miss, fetch from MongoDB
    const activeUserObj = new mongoose.Types.ObjectId(activeUserId);
    const otherUserObj = new mongoose.Types.ObjectId(otherUserId);

    const messages = await Message.find({
      $or: [
        { senderId: activeUserObj, receiverId: otherUserObj },
        { senderId: otherUserObj, receiverId: activeUserObj }
      ]
    })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name profilePhoto email')
      .populate('receiverId', 'name profilePhoto email')
      .populate('artworkId', 'title images price');

    // Mark incoming messages as read in database
    const writeResult = await Message.updateMany(
      { senderId: otherUserObj, receiverId: activeUserObj, read: false },
      { $set: { read: true } }
    );

    if (writeResult.modifiedCount > 0) {
      // Invalidate active user conversations so unread badges clear immediately
      await delCache(`chat:conversations:${activeUserId}`);
    }

    // Cache the chat history list for 30 seconds
    await setCache(historyKey, messages, 30);

    res.status(200).json(messages);
  } catch (err) {
    console.error('[Messages] History fetch error:', err.message);
    res.status(500).json({ message: 'Server error while fetching chat history.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/user/:userId - Get basic user details
// ─────────────────────────────────────────────────────────────────────────────
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('name profilePhoto email userType');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error('[Messages] User details fetch error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
