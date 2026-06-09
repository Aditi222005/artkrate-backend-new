const express = require("express");
const router = express.Router();
const User = require("../models/user.model");
const auth = require("../middlewares/auth");
const logActivity = require("../utils/logActivity");

router.post("/:id", auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let following;
    if (targetUser.followers.includes(currentUserId)) {
      // Unfollow
      targetUser.followers.pull(currentUserId);
      currentUser.following.pull(targetUserId);
      following = false;
    } else {
      // Follow
      targetUser.followers.push(currentUserId);
      currentUser.following.push(targetUserId);
      following = true;
      // Emit activity for the user being followed
      logActivity({
        userId: targetUserId,
        type: 'new_follower',
        title: 'New follower',
        detail: `${currentUser.name} started following you`,
        relatedUserId: currentUserId,
      });
    }

    await targetUser.save();
    await currentUser.save();

    res.status(200).json({
      message: following ? "Followed" : "Unfollowed",
      following,
      followersCount: targetUser.followers.length,
    });
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;