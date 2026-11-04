const ACTIONS: [&str; 7] = [
    "previousMinute", "previousSecond", "previous", "toggle", "next", "nextSecond", "nextMinute",
];

pub struct Layout {
    pub left: u32,
    pub cell: u32,
    pub toolbar: u32,
    pub strip: u32,
}

impl Layout {
    pub fn new(width: u32, height: u32) -> Self {
        let cell = (width / ACTIONS.len() as u32).min((height / 8).clamp(36, 76));
        let toolbar = if cell == 0 { 0 } else { (height / 9).clamp(24, 48).min(height / 2) };
        Self {
            left: (width - cell * ACTIONS.len() as u32) / 2,
            cell,
            toolbar,
            strip: (height / 30).clamp(4, 12).min(height.saturating_sub(toolbar + 1)),
        }
    }

    pub fn button(&self, x: f64, y: f64, height: u32) -> Option<&'static str> {
        if self.cell == 0 || x < f64::from(self.left) ||
            y < f64::from(height - self.toolbar) || y >= f64::from(height) {
            return None;
        }
        ACTIONS.get(((x - f64::from(self.left)) / f64::from(self.cell)) as usize).copied()
    }

    pub fn in_strip(&self, y: f64, height: u32) -> bool {
        let end = height - self.toolbar;
        y >= f64::from(end - self.strip) && y < f64::from(end)
    }
}
