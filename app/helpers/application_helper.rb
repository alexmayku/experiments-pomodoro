module ApplicationHelper
  # Format date for history display
  # Shows "Yesterday" for yesterday, day name for this week, full date otherwise
  def format_history_date(date)
    today = Date.current
    
    case date
    when today - 1.day
      "Yesterday"
    when (today - 6.days)..today
      date.strftime("%A") # Day name (e.g., "Monday")
    else
      date.strftime("%b %d") # e.g., "Jan 13"
    end
  end
end
