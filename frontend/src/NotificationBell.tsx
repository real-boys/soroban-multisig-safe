import React, { useState, useMemo } from 'react';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  IconButton, Badge, Popover, Box, Typography, List, ListItem,
  ListItemText, Button, Select, MenuItem, FormControl, InputLabel, Divider, Stack
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CircleIcon from '@mui/icons-material/Circle';

const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markAllAsRead, markAsRead } = useNotifications();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [safeFilter, setSafeFilter] = useState<string>('all');

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const filteredNotifications = useMemo(() => {
    if (safeFilter === 'all') return notifications;
    return notifications.filter(n => n.safeId === safeFilter);
  }, [notifications, safeFilter]);

  const open = Boolean(anchorEl);
  const id = open ? 'notifications-popover' : undefined;

  const getSafeIds = () => {
    const ids = new Set(notifications.map(n => n.safeId));
    return Array.from(ids);
  };

  return (
    <>
      <IconButton color="inherit" onClick={handleClick}>
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 2, width: 350, maxHeight: 500, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Notifications</Typography>
            {unreadCount > 0 && (
              <Button size="small" onClick={markAllAsRead}>Mark all read</Button>
            )}
          </Stack>

          <FormControl size="small" sx={{ mb: 2 }}>
            <InputLabel>Filter by Safe</InputLabel>
            <Select
              value={safeFilter}
              label="Filter by Safe"
              onChange={(e) => setSafeFilter(e.target.value)}
            >
              <MenuItem value="all">All Safes</MenuItem>
              {getSafeIds().map(sid => (
                <MenuItem key={sid} value={sid}>{sid}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />

          <List sx={{ flexGrow: 1, overflowY: 'auto' }}>
            {filteredNotifications.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                No notifications
              </Typography>
            ) : (
              filteredNotifications.map((notif) => (
                <ListItem
                  key={notif.id}
                  alignItems="flex-start"
                  sx={{
                    bgcolor: notif.read ? 'transparent' : 'action.hover',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.selected' }
                  }}
                  onClick={() => markAsRead(notif.id)}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" gap={1}>
                        {!notif.read && <CircleIcon color="primary" sx={{ fontSize: 10 }} />}
                        <Typography variant="subtitle2" color={notif.type === 'critical' ? 'error' : 'text.primary'}>
                          {notif.title}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <React.Fragment>
                        <Typography variant="body2" color="text.secondary" display="block">
                          {notif.message}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {new Date(notif.createdAt).toLocaleString()} | {notif.safeId}
                        </Typography>
                      </React.Fragment>
                    }
                  />
                </ListItem>
              ))
            )}
          </List>
        </Box>
      </Popover>
    </>
  );
};

export default NotificationBell;